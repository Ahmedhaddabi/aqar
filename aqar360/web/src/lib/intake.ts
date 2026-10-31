// Website forms → CRM. Validates each form, finds or creates the customer, records consent, links the listing the
// visitor chose, numbers the request and issues the private self-service link. Server-side only.
import { createHash, randomBytes } from "node:crypto";

import { and, asc, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  activities, areas, auditLog, consents, contacts, OPEN_STATUSES, projects, properties, type RequestKind, requests,
  type RequestStatus, settings, wilayats,
} from "@/db/schema";

import type { Locale } from "./config";
import type { FormConfig } from "./content";
import { notify } from "./notify";
import { matchRequest } from "./matching";
import { afterRequestReceived } from "./messages";

// Option lists offered by the website forms (labels live in i18n/dictionaries.ts → options).
const PROPERTY_TYPES = ["Apartment", "Villa", "Land", "Building", "Shop", "Office", "Warehouse", "Showroom", "Project",
  "Commercial", "Other"] as const;
const TIMING = ["Immediately", "Within 1 Month", "1-3 Months", "3-6 Months", "Not Urgent"] as const;
export const FORM_OPTIONS = {
  "Aqar Search Request": {
    purpose: ["Buy", "Rent"], property_type: [...PROPERTY_TYPES], timing: [...TIMING],
    request_kind: ["Standard", "Corporate", "Investment Mandate"], preferred_channel: ["Email", "WhatsApp", "Phone"],
    investment_goal: ["Rental Yield", "Capital Growth", "Own Use", "Development", "Other"],
  },
  "Aqar Opportunity Intake": {
    request_type: ["Sell", "Let", "Content Only", "Market Project"], property_type: [...PROPERTY_TYPES],
    property_condition: ["New", "Excellent", "Good", "Needs Renovation", "Under Construction"],
    readiness: ["Ready Now", "Within 3 Months", "Later"],
  },
  "Aqar Consultation Request": {
    client_goal: ["Sell", "Rent", "Develop", "Reposition", "Marketing", "Increase Occupancy"],
    asset_type: ["Land", "Building", "Project", "Commercial", "Residential"],
    requested_output: ["Session", "Site Visit", "Marketing Plan", "Feasibility Lite", "Positioning", "Content Plan"],
    expected_timeline: [...TIMING],
  },
} as const;

export const captchaRequired = () => !!process.env.TURNSTILE_SECRET_KEY;

export async function formConfig(lang: Locale): Promise<FormConfig> {
  const rows = await db.select({ id: areas.id, nameAr: areas.nameAr, nameEn: areas.nameEn, wAr: wilayats.nameAr, wEn: wilayats.nameEn })
    .from(areas).leftJoin(wilayats, eq(areas.wilayatId, wilayats.id)).where(eq(areas.active, true)).orderBy(asc(areas.nameEn));
  return {
    areas: rows.map((a) => ({ id: String(a.id), name: lang === "ar" ? a.nameAr : a.nameEn, wilayat: (lang === "ar" ? a.wAr : a.wEn) ?? "" })),
    options: FORM_OPTIONS as unknown as FormConfig["options"],
    // No approved legal texts yet: forms show the privacy notice; marketing consent is offered once wording is approved.
    terms: { privacy_policy: null, marketing_consent: null },
    captcha_required: captchaRequired(),
  };
}

// ---- Validation ------------------------------------------------------------------------------------------------
const MESSAGES = {
  ar: { required: "هذا الحقل مطلوب.", invalid: "القيمة غير صحيحة.", phone: "يرجى إدخال رقم هاتف صحيح (8 أرقام).",
    email: "يرجى إدخال بريد إلكتروني صحيح.", budget: "الميزانية من لا يمكن أن تكون أعلى من الميزانية حتى." },
  en: { required: "This field is required.", invalid: "Please check this value.", phone: "Please enter a valid phone number (8 digits).",
    email: "Please enter a valid email.", budget: "Budget From cannot be higher than Budget To." },
};

/** Omani numbers as +968XXXXXXXX; other international numbers kept with their +country code. */
export function normalizePhone(raw: string) {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (/^[2795]\d{7}$/.test(digits)) return `+968${digits}`;
  if (/^968[2795]\d{7}$/.test(digits)) return `+${digits}`;
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  return null;
}

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().transform((v) => v || undefined);
const num = z.coerce.number().finite().nonnegative();
const oneOf = <T extends readonly string[]>(values: T) => z.enum(values as unknown as [string, ...string[]]);

const common = {
  full_name: text(120).min(1),
  phone: z.string().transform((v, ctx) => normalizePhone(v) ?? (ctx.addIssue({ code: "custom", message: "phone" }), z.NEVER)),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(160)]).optional().transform((v) => v || undefined),
  language: z.enum(["ar", "en"]).default("ar"),
  idempotency_key: text(100).min(8),
  marketing_consent: z.boolean().optional(),
  captcha_token: optionalText(4000),
  source_channel: optionalText(40), landing_page: optionalText(500), referrer: optionalText(500),
  utm_source: optionalText(140), utm_medium: optionalText(140), utm_campaign: optionalText(140), utm_content: optionalText(140),
};
const S = FORM_OPTIONS["Aqar Search Request"];
const L = FORM_OPTIONS["Aqar Opportunity Intake"];
const C = FORM_OPTIONS["Aqar Consultation Request"];
const SCHEMAS = {
  search: z.object({
    ...common, purpose: oneOf(S.purpose), property_type: oneOf(S.property_type), areas: z.array(z.string()).min(1).max(20),
    budget_min: num.optional(), budget_max: num.positive(), strict_budget: z.boolean().optional(),
    bedrooms_min: z.coerce.number().int().min(0).max(20).optional(), timing: oneOf(S.timing), notes: optionalText(1000),
    preferred_channel: oneOf(S.preferred_channel), match_alerts: z.boolean().optional(),
    request_kind: oneOf(S.request_kind).optional(), company_name: optionalText(140),
    units_needed: z.coerce.number().int().min(1).max(500).optional(), investment_goal: oneOf(S.investment_goal).optional(),
    foreign_ownership_required: z.boolean().optional(),
    interest_type: z.enum(["project", "property"]).optional(), interest_id: optionalText(140), interest_unit: optionalText(60),
    source_page: optionalText(300),
  }),
  property: z.object({
    ...common, request_type: oneOf(L.request_type), property_type: oneOf(L.property_type), area: z.string().min(1),
    location_details: optionalText(300), size_sqm: num.optional(), bedrooms: z.coerce.number().int().min(0).max(50).optional(),
    bathrooms: z.coerce.number().int().min(0).max(50).optional(), asking_price: num.optional(),
    property_condition: oneOf(L.property_condition).optional(), readiness: oneOf(L.readiness).optional(),
    description: optionalText(2000), accuracy_declaration: z.literal(true),
  }),
  consultation: z.object({
    ...common, client_goal: oneOf(C.client_goal), asset_type: oneOf(C.asset_type), requested_output: oneOf(C.requested_output),
    area: optionalText(20), map_link: z.union([z.literal(""), z.string().url().startsWith("https://").max(500)]).optional(),
    budget: num.optional(), expected_timeline: oneOf(C.expected_timeline).optional(), current_situation: optionalText(2000),
  }),
};
export type FormKind = keyof typeof SCHEMAS;
export const isFormKind = (kind: string): kind is FormKind => kind in SCHEMAS;

export type IntakeError = { status: number; code: string; message: string; fields?: Record<string, string> };
export type IntakeResult = { request_number: string; status: string; self_service_token?: string; duplicate_submission?: boolean };

// ---- Helpers ---------------------------------------------------------------------------------------------------
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function setting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return (row?.value as T) ?? fallback;
}

export async function verifyCaptcha(token: string | undefined, ip: string | undefined) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  return Boolean((await res.json()).success);
}

/** Same phone (or, without a phone match, same email) = same customer; missing details are filled in. */
async function findOrCreateContact(name: string, phone: string, email: string | undefined, language: "ar" | "en") {
  const [byPhone] = await db.select().from(contacts).where(eq(contacts.phone, phone)).limit(1);
  const [match] = byPhone ? [byPhone] : email ? await db.select().from(contacts).where(eq(contacts.email, email)).limit(1) : [];
  if (match) {
    await db.update(contacts).set({ phone: match.phone ?? phone, email: match.email ?? email ?? null, updatedAt: new Date() })
      .where(eq(contacts.id, match.id));
    return { id: match.id, returning: true };
  }
  const [created] = await db.insert(contacts).values({ name, phone, email: email ?? null, language }).returning({ id: contacts.id });
  return { id: created.id, returning: false };
}

/** The listing a visitor chose on the map or a project page; only public, verified listings count. */
async function resolveInterest(type?: string, id?: string, unit?: string) {
  if (type === "project" && id) {
    const [project] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.slug, id), eq(projects.public, true), eq(projects.verified, true)));
    if (!project) return {};
    const [unitRow] = unit ? await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.projectId, project.id), eq(properties.unitNumber, unit))) : [];
    return { interestProjectId: project.id, interestPropertyId: unitRow?.id ?? null };
  }
  if (type === "property" && id) {
    const [property] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.code, id), eq(properties.public, true), eq(properties.verified, true)));
    return property ? { interestPropertyId: property.id } : {};
  }
  return {};
}

const CUSTOMER_STATUS: Record<"ar" | "en", Record<string, string>> = {
  ar: { new: "تم الاستلام", contacted: "قيد المراجعة", working: "نبحث لك", viewing: "معاينة", offer: "عرض قيد التفاوض",
    won: "مكتمل", closed: "مغلق" },
  en: { new: "Received", contacted: "Under review", working: "Searching for you", viewing: "Viewing", offer: "Offer in progress",
    won: "Completed", closed: "Closed" },
};
export const customerStatus = (status: RequestStatus, lang: "ar" | "en") => CUSTOMER_STATUS[lang][status] ?? status;

// ---- Submit ----------------------------------------------------------------------------------------------------
const KIND: Record<FormKind, RequestKind> = { search: "search", property: "listing", consultation: "consulting" };
const RATE_LIMIT = 10; // submissions per IP per hour

export async function submitForm(kind: FormKind, payload: unknown, ip?: string): Promise<{ ok: true; data: IntakeResult } | { ok: false; error: IntakeError }> {
  const lang: "ar" | "en" = (payload as { language?: string })?.language === "en" ? "en" : "ar";
  const msg = MESSAGES[lang];
  const parsed = SCHEMAS[kind].safeParse(payload);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fields[key] ??= issue.message === "phone" ? msg.phone : key === "email" ? msg.email
        : issue.code === "invalid_type" && issue.input === undefined ? msg.required : msg.invalid;
    }
    return { ok: false, error: { status: 400, code: "validation_error", message: msg.invalid, fields } };
  }
  const data = parsed.data as z.infer<(typeof SCHEMAS)["search"]> & z.infer<(typeof SCHEMAS)["property"]> & z.infer<(typeof SCHEMAS)["consultation"]>;
  if (kind === "search" && data.budget_min && data.budget_min > data.budget_max) {
    return { ok: false, error: { status: 400, code: "validation_error", message: msg.invalid, fields: { budget_min: msg.budget } } };
  }
  if (kind === "search" && data.request_kind === "Corporate" && !data.company_name) {
    return { ok: false, error: { status: 400, code: "validation_error", message: msg.invalid, fields: { company_name: msg.required } } };
  }

  const [existing] = await db.select().from(requests).where(eq(requests.idempotencyKey, data.idempotency_key));
  if (existing) return { ok: true, data: { request_number: existing.number, status: customerStatus(existing.status, lang), duplicate_submission: true } };

  const ipHash = ip ? sha256(`aqar:${ip}`) : null;
  if (ipHash) {
    const [recent] = await db.select({ n: count() }).from(auditLog).where(and(eq(auditLog.action, "form_submitted"),
      gt(auditLog.at, new Date(Date.now() - 3_600_000)), sql`${auditLog.data}->>'ip' = ${ipHash}`));
    if (recent.n >= RATE_LIMIT) return { ok: false, error: { status: 429, code: "rate_limited", message: "Too many requests." } };
  }
  if (!(await verifyCaptcha(data.captcha_token, ip))) {
    return { ok: false, error: { status: 400, code: "captcha_failed", message: msg.invalid } };
  }

  const contact = await findOrCreateContact(data.full_name, data.phone, data.email, lang);
  const validDays = await setting<number>("requestValidDays", 90);
  const token = randomBytes(24).toString("base64url");
  const areaIds = kind === "search" ? data.areas.map(Number).filter(Number.isInteger)
    : data.area && Number.isInteger(Number(data.area)) ? [Number(data.area)] : [];
  const knownAreas = areaIds.length ? (await db.select({ id: areas.id }).from(areas).where(inArray(areas.id, areaIds))).map((a) => a.id) : [];
  const details = Object.fromEntries(Object.entries(data).filter(([key, value]) => value !== undefined && !(key in common)
    && !["areas", "area", "purpose", "property_type", "budget_min", "budget_max", "bedrooms_min", "timing", "notes",
      "preferred_channel", "request_type", "client_goal", "interest_type", "interest_id", "interest_unit", "source_page"].includes(key)));
  const attribution = Object.fromEntries(["landing_page", "referrer", "utm_source", "utm_medium", "utm_campaign", "utm_content"]
    .filter((k) => data[k as keyof typeof data]).map((k) => [k, String(data[k as keyof typeof data])]));

  const [request] = await db.insert(requests).values({
    number: sql`'REQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('request_number_seq')::text, 5, '0')`,
    kind: KIND[kind], subtype: data.purpose ?? data.request_type ?? data.client_goal ?? null,
    contactId: contact.id, propertyType: data.property_type ?? data.asset_type ?? null, areaIds: knownAreas,
    budgetMin: data.budget_min ?? null, budgetMax: data.budget_max ?? data.asking_price ?? data.budget ?? null,
    bedroomsMin: data.bedrooms_min ?? data.bedrooms ?? null, timing: data.timing ?? data.expected_timeline ?? null,
    notes: data.notes ?? data.description ?? data.current_situation ?? "", details,
    preferredChannel: data.preferred_channel ?? null, language: lang,
    ...(await resolveInterest(data.interest_type, data.interest_id, data.interest_unit)),
    sourceChannel: data.source_channel ?? "Website", sourcePage: data.source_page ?? null, attribution,
    expiresOn: sql`(current_date + ${validDays}::int)`, selfTokenHash: sha256(token), idempotencyKey: data.idempotency_key,
  }).returning();

  // Consent: updates about this request on the channels the customer gave us; alerts only when ticked.
  const evidence = `${request.number} submitted on the website`;
  const channels = ["phone", ...(data.email ? ["email"] : []), ...(data.preferred_channel === "WhatsApp" ? ["whatsapp"] : [])];
  await db.insert(consents).values([
    ...channels.map((channel) => ({ contactId: contact.id, purpose: "request_updates" as const, channel, granted: true,
      source: "website_form", evidence })),
    ...(data.match_alerts ? [{ contactId: contact.id, purpose: "match_alerts" as const, channel: (data.preferred_channel ?? "phone").toLowerCase(),
      granted: true, source: "website_form", evidence }] : []),
  ]);
  await db.insert(activities).values({ requestId: request.id, contactId: contact.id, type: "system",
    body: contact.returning ? "returning_customer" : "new_customer" });
  await db.insert(auditLog).values({ action: "form_submitted", entity: "request", entityId: String(request.id),
    data: { kind, ...(ipHash ? { ip: ipHash } : {}) } });
  if (request.kind === "search") await matchRequest(request.id).catch((e) => console.error("matching failed:", e.message));
  await notify({ app: "crm", roles: ["admin", "manager"] }, { kind: request.kind === "listing" ? "opportunity_new" : "request_new",
    title: `${request.number} · ${data.full_name}`, href: `/admin/requests/${request.id}`, key: `request_new:${request.id}` });
  await afterRequestReceived(request.id, token).catch((e) => console.error("confirmation failed:", e.message));
  return { ok: true, data: { request_number: request.number, status: customerStatus(request.status, lang), self_service_token: token } };
}

// ---- Customer self-service (private link) ----------------------------------------------------------------------
export type MyRequestView = {
  request_number: string; request_type: string; status: string; budget_max?: number; timing?: string; notes?: string;
  alerts_paused: boolean; expires_on: string | null; closed: boolean; purpose?: string; property_type?: string; areas?: string[];
};

async function byToken(token: string) {
  if (!token || token.length > 100) return null;
  const [row] = await db.select().from(requests).where(eq(requests.selfTokenHash, sha256(token)));
  return row ?? null;
}

export async function getMyRequest(token: string, lang: "ar" | "en"): Promise<MyRequestView | null> {
  const r = await byToken(token);
  if (!r) return null;
  const areaNames = r.areaIds.length ? await db.select({ ar: areas.nameAr, en: areas.nameEn }).from(areas).where(inArray(areas.id, r.areaIds)) : [];
  return { request_number: r.number, request_type: r.kind, status: customerStatus(r.status, lang), budget_max: r.budgetMax ?? undefined,
    timing: r.timing ?? undefined, notes: r.notes || undefined, alerts_paused: r.alertsPaused, expires_on: r.expiresOn,
    closed: !(OPEN_STATUSES as readonly string[]).includes(r.status), purpose: r.subtype ?? undefined,
    property_type: r.propertyType ?? undefined, areas: areaNames.map((a) => (lang === "ar" ? a.ar : a.en)) };
}

const UPDATE = z.object({
  token: z.string(), budget_max: z.coerce.number().positive().optional(), timing: oneOf(TIMING).optional(),
  notes: optionalText(1000), state: z.enum(["pause", "resume", "close"]).optional(),
});

export async function updateMyRequest(payload: unknown, lang: "ar" | "en") {
  const parsed = UPDATE.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: { status: 400, code: "validation_error", message: MESSAGES[lang].invalid } };
  const r = await byToken(parsed.data.token);
  if (!r) return { ok: false as const, error: { status: 403, code: "not_permitted", message: "Link not valid." } };
  if (!(OPEN_STATUSES as readonly string[]).includes(r.status)) {
    return { ok: false as const, error: { status: 400, code: "closed", message: lang === "ar" ? "هذا الطلب مغلق." : "This request is closed." } };
  }
  const { budget_max, timing, notes, state } = parsed.data;
  const validDays = await setting<number>("requestValidDays", 90);
  await db.update(requests).set({
    ...(budget_max ? { budgetMax: budget_max } : {}), ...(timing ? { timing } : {}), ...(notes !== undefined ? { notes } : {}),
    ...(state === "pause" ? { alertsPaused: true } : state === "resume" ? { alertsPaused: false } : {}),
    ...(state === "close" ? { status: "closed" as const, closedReason: "Closed by the customer" } : {
      expiresOn: sql`greatest(${requests.expiresOn}, current_date + ${validDays}::int)` }),
    updatedAt: new Date(),
  }).where(eq(requests.id, r.id));
  await db.insert(activities).values({ requestId: r.id, contactId: r.contactId, type: "system",
    body: state === "close" ? "customer_closed" : "customer_updated" });
  await matchRequest(r.id).catch((e) => console.error("matching failed:", e.message));
  return { ok: true as const, data: await getMyRequest(parsed.data.token, lang) };
}

export async function stopAlerts(token: string, lang: "ar" | "en") {
  const r = await byToken(token);
  if (!r) return { ok: false as const, error: { status: 403, code: "not_permitted", message: "Link not valid." } };
  await db.update(requests).set({ alertsPaused: true, updatedAt: new Date() }).where(eq(requests.id, r.id));
  await db.insert(consents).values(["match_alerts", "marketing"].map((purpose) => ({ contactId: r.contactId,
    purpose: purpose as "match_alerts" | "marketing", channel: "all", granted: false, source: "self_update", evidence: r.number })));
  await db.insert(activities).values({ requestId: r.id, contactId: r.contactId, type: "system", body: "customer_stopped_alerts" });
  return { ok: true as const, data: await getMyRequest(token, lang) };
}

/** Latest consent per purpose and channel, newest first (for the admin customer page). */
export async function consentSummary(contactId: number) {
  const rows = await db.select().from(consents).where(eq(consents.contactId, contactId)).orderBy(desc(consents.createdAt), desc(consents.id));
  // Newest first: a later "all channels" choice overrides every older per-channel row for that purpose.
  const seen = new Set<string>();
  const coveredByAll = new Set<string>();
  return rows.filter((r) => {
    if (coveredByAll.has(r.purpose) || seen.has(`${r.purpose}:${r.channel}`)) return false;
    seen.add(`${r.purpose}:${r.channel}`);
    if (r.channel === "all") coveredByAll.add(r.purpose);
    return true;
  });
}

