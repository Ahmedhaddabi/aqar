// Online viewing booking: customers pick a free time for a property we suggested, from their portal. Opening hours come
// from Admin → Settings; a time is free when neither the agent nor the property has another viewing then. Times are
// Muscat time (UTC+4, no daylight saving).
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { activities, areas, matches, OPEN_STATUSES, properties, projects, requests, savedProperties, settings } from "@/db/schema";

import { audit } from "./auth";
import { portalLink } from "./doc-link";
import { sendMessage } from "./messages";
import { notify } from "./notify";

const OFFSET = 4 * 3_600_000;

export type ViewingRules = { selfBooking: boolean; days: number[]; start: number; end: number; slotMinutes: number; noticeHours: number;
  daysAhead: number; maxUpcoming: number };
export const DEFAULT_RULES: ViewingRules = { selfBooking: true, days: [6, 0, 1, 2, 3, 4], start: 9, end: 18, slotMinutes: 60, noticeHours: 24,
  daysAhead: 14, maxUpcoming: 3 };
export const RULE_KEYS = { selfBooking: "viewingSelfBooking", days: "viewingDays", start: "viewingStart", end: "viewingEnd",
  slotMinutes: "viewingSlotMinutes", noticeHours: "viewingNoticeHours", daysAhead: "viewingDaysAhead" } as const;

export async function viewingRules(): Promise<ViewingRules> {
  const rows = await db.select().from(settings).where(inArray(settings.key, Object.values(RULE_KEYS)));
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  const num = (key: string, fallback: number) => (Number.isFinite(Number(get(key))) && get(key) !== "" && get(key) != null ? Number(get(key)) : fallback);
  const days = String(get(RULE_KEYS.days) ?? DEFAULT_RULES.days.join(",")).split(",").filter(Boolean).map(Number).filter((d) => d >= 0 && d <= 6);
  const rules = { ...DEFAULT_RULES, selfBooking: get(RULE_KEYS.selfBooking) !== false, days, start: num(RULE_KEYS.start, DEFAULT_RULES.start),
    end: num(RULE_KEYS.end, DEFAULT_RULES.end), slotMinutes: num(RULE_KEYS.slotMinutes, DEFAULT_RULES.slotMinutes),
    noticeHours: num(RULE_KEYS.noticeHours, DEFAULT_RULES.noticeHours), daysAhead: num(RULE_KEYS.daysAhead, DEFAULT_RULES.daysAhead) };
  return rules.end > rules.start ? rules : { ...rules, end: rules.start + 1 };
}

/** "YYYY-MM-DD" of a moment in Muscat. */
export const muscatDay = (at: Date) => new Date(at.getTime() + OFFSET).toISOString().slice(0, 10);
export const muscatTime = (at: Date) => new Date(at.getTime() + OFFSET).toISOString().slice(11, 16);

type Reader = Pick<typeof db, "select">;

/** Free start times per day for one agent (or nobody yet) and one property. Inside a transaction pass it as `exec`. */
export async function freeSlots(opts: { agentId: number | null; propertyId: number; rules: ViewingRules; now?: Date; exec?: Reader }) {
  const { rules } = opts;
  const now = opts.now ?? new Date();
  const earliest = now.getTime() + rules.noticeHours * 3_600_000;
  const until = new Date(now.getTime() + (rules.daysAhead + 1) * 86_400_000);
  const slotMs = rules.slotMinutes * 60_000;
  const busy = await (opts.exec ?? db).select({ at: activities.dueAt }).from(activities).where(and(eq(activities.type, "viewing"), eq(activities.done, false),
    gte(activities.dueAt, new Date(now.getTime() - slotMs)), lt(activities.dueAt, until),
    or(eq(activities.propertyId, opts.propertyId), ...(opts.agentId ? [eq(activities.userId, opts.agentId)] : []))));
  const taken = busy.map((b) => b.at!.getTime());
  const out: { day: string; slots: Date[] }[] = [];
  const today = new Date(`${muscatDay(now)}T00:00:00Z`).getTime();
  for (let d = 0; d <= rules.daysAhead; d++) {
    const midnight = today + d * 86_400_000; // Muscat midnight expressed as if it were UTC
    if (!rules.days.includes(new Date(midnight).getUTCDay())) continue;
    const slots: Date[] = [];
    for (let m = rules.start * 60; m + rules.slotMinutes <= rules.end * 60; m += rules.slotMinutes) {
      const at = midnight + m * 60_000 - OFFSET;
      if (at < earliest || taken.some((t) => t < at + slotMs && at < t + slotMs)) continue;
      slots.push(new Date(at));
    }
    if (slots.length) out.push({ day: new Date(midnight).toISOString().slice(0, 10), slots });
  }
  return out;
}

/** The property suggestions the customer has received for open requests, with what they did with each. */
export async function suggestionsFor(contactId: number) {
  const rows = await db.select({ m: matches, r: requests, p: properties, area: areas, project: projects }).from(matches)
    .innerJoin(requests, eq(matches.requestId, requests.id)).innerJoin(properties, eq(matches.propertyId, properties.id))
    .leftJoin(areas, eq(properties.areaId, areas.id)).leftJoin(projects, eq(properties.projectId, projects.id))
    .where(and(eq(requests.contactId, contactId), eq(matches.status, "sent"), inArray(requests.status, [...OPEN_STATUSES]),
      inArray(properties.status, ["available", "reserved"])))
    .orderBy(desc(matches.sentAt)).limit(30);
  const ids = rows.map((x) => x.p.id);
  const [saved, upcoming] = ids.length ? await Promise.all([
    db.select({ id: savedProperties.propertyId }).from(savedProperties).where(and(eq(savedProperties.contactId, contactId), inArray(savedProperties.propertyId, ids))),
    db.select().from(activities).where(and(eq(activities.contactId, contactId), eq(activities.type, "viewing"), eq(activities.done, false),
      gt(activities.dueAt, new Date()), inArray(activities.propertyId, ids))),
  ]) : [[], []];
  return rows.map(({ m, r, p, area, project }) => ({
    matchId: m.id, requestNumber: r.number, property: p, areaEn: area?.nameEn ?? "", areaAr: area?.nameAr ?? "", projectName: project?.nameEn ?? null,
    price: r.subtype === "Rent" ? p.rentPrice : p.salePrice ?? p.rentPrice, rent: r.subtype === "Rent" || (!p.salePrice && !!p.rentPrice),
    saved: saved.some((s) => s.id === p.id), viewing: upcoming.find((a) => a.propertyId === p.id) ?? null,
  }));
}

export async function upcomingViewings(contactId: number) {
  return db.select({ a: activities, p: properties }).from(activities).leftJoin(properties, eq(activities.propertyId, properties.id))
    .where(and(eq(activities.contactId, contactId), eq(activities.type, "viewing"), eq(activities.done, false), gt(activities.dueAt, new Date())))
    .orderBy(asc(activities.dueAt));
}

/** A suggestion this customer may book: sent to them, request still open, property still on offer. */
async function bookable(contactId: number, matchId: number) {
  const [row] = await db.select({ m: matches, r: requests, p: properties }).from(matches).innerJoin(requests, eq(matches.requestId, requests.id))
    .innerJoin(properties, eq(matches.propertyId, properties.id))
    .where(and(eq(matches.id, matchId), eq(requests.contactId, contactId), eq(matches.status, "sent"), inArray(requests.status, [...OPEN_STATUSES]),
      isNotNull(matches.propertyId), inArray(properties.status, ["available", "reserved"])));
  return row ?? null;
}

export async function slotsForMatch(contactId: number, matchId: number) {
  const row = await bookable(contactId, matchId);
  const rules = await viewingRules();
  if (!row || !rules.selfBooking) return null;
  return { ...row, rules, days: await freeSlots({ agentId: row.r.assignedTo, propertyId: row.p.id, rules }) };
}

const whenText = (at: Date, lang: "ar" | "en") => new Intl.DateTimeFormat(lang === "ar" ? "ar-OM" : "en-GB",
  { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Muscat" }).format(at);
const propertyText = (p: typeof properties.$inferSelect) => `${p.kind}${p.bedrooms ? ` · ${p.bedrooms} BR` : ""} (${p.code})`;

export type BookResult = { ok: true; activityId: number } | { ok: false; reason: "invalid" | "closed" | "taken" | "limit" };

/**
 * Books the viewing if the time is still free. A transaction-scoped advisory lock per property stops two customers
 * taking the same time; "replaces" cancels the customer's earlier viewing (reschedule) once the new one is in.
 */
export async function bookOnline(contactId: number, matchId: number, slotIso: string, replaces?: number): Promise<BookResult> {
  const row = await bookable(contactId, matchId);
  const rules = await viewingRules();
  if (!row) return { ok: false, reason: "invalid" };
  if (!rules.selfBooking) return { ok: false, reason: "closed" };
  const at = new Date(slotIso);
  if (Number.isNaN(at.getTime())) return { ok: false, reason: "invalid" };
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${7_302_000_000 + row.p.id})`);
    const [{ n }] = await tx.select({ n: count() }).from(activities).where(and(eq(activities.contactId, contactId), eq(activities.type, "viewing"),
      eq(activities.done, false), eq(activities.source, "online"), gt(activities.dueAt, new Date())));
    if (n - (replaces ? 1 : 0) >= rules.maxUpcoming) return { ok: false as const, reason: "limit" as const };
    const free = await freeSlots({ agentId: row.r.assignedTo, propertyId: row.p.id, rules, exec: tx });
    if (!free.some((d) => d.slots.some((s) => s.getTime() === at.getTime()))) return { ok: false as const, reason: "taken" as const };
    const [a] = await tx.insert(activities).values({ requestId: row.r.id, contactId, userId: row.r.assignedTo, type: "viewing", dueAt: at,
      propertyId: row.p.id, source: "online", body: "Booked online by the customer" }).returning();
    if (["new", "contacted", "working"].includes(row.r.status)) {
      await tx.update(requests).set({ status: "viewing", updatedAt: new Date() }).where(eq(requests.id, row.r.id));
    }
    return { ok: true as const, activityId: a.id };
  });
  if (!result.ok) return result;
  if (replaces) await cancelOnline(contactId, replaces, { quiet: true });
  const when = whenText(at, row.r.language);
  await notify({ userIds: [row.r.assignedTo], app: "crm", roles: row.r.assignedTo ? ["admin"] : ["admin", "manager"] },
    { kind: replaces ? "viewing_changed" : "viewing_booked", title: `${row.r.number} · ${propertyText(row.p)} · ${when}`,
      href: `/admin/requests/${row.r.id}`, key: `viewing_booked:${result.activityId}` });
  await sendMessage({ key: `viewing_booked:${result.activityId}`, template: "viewing_booked", contactId, requestId: row.r.id, purpose: "transactional",
    vars: { when, property: propertyText(row.p), number: row.r.number, portal: portalLink(contactId) } }).catch((e) => console.error("viewing confirmation failed:", (e as Error).message));
  await audit("viewing_booked_online", "request", row.r.id, { activityId: result.activityId, propertyId: row.p.id, replaces: replaces ?? null });
  return result;
}

/**
 * Books a viewing the WhatsApp agent agreed with the customer: same opening hours, notice and "nobody else then" rules as
 * online booking, under the same per-property lock. The assigned agent (or admins and managers) are told.
 */
export async function bookForChat(opts: { contactId: number; propertyId: number; requestId: number | null; agentId: number | null; at: Date; note: string }):
  Promise<{ ok: true; activityId: number } | { ok: false; reason: "closed" | "taken" | "limit" }> {
  const rules = await viewingRules();
  if (!rules.selfBooking) return { ok: false, reason: "closed" };
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${7_302_000_000 + opts.propertyId})`);
    const [{ n }] = await tx.select({ n: count() }).from(activities).where(and(eq(activities.contactId, opts.contactId), eq(activities.type, "viewing"),
      eq(activities.done, false), gt(activities.dueAt, new Date())));
    if (n >= rules.maxUpcoming) return { ok: false as const, reason: "limit" as const };
    const free = await freeSlots({ agentId: opts.agentId, propertyId: opts.propertyId, rules, exec: tx });
    if (!free.some((d) => d.slots.some((x) => x.getTime() === opts.at.getTime()))) return { ok: false as const, reason: "taken" as const };
    const [a] = await tx.insert(activities).values({ requestId: opts.requestId, contactId: opts.contactId, userId: opts.agentId, type: "viewing", dueAt: opts.at,
      propertyId: opts.propertyId, source: "whatsapp_agent", body: opts.note.slice(0, 500) }).returning();
    if (opts.requestId) await tx.update(requests).set({ status: "viewing", updatedAt: new Date() })
      .where(and(eq(requests.id, opts.requestId), inArray(requests.status, ["new", "contacted", "working"])));
    return { ok: true as const, activityId: a.id };
  });
  if (!result.ok) return result;
  const [p] = await db.select().from(properties).where(eq(properties.id, opts.propertyId));
  await notify({ userIds: [opts.agentId], app: "crm", roles: opts.agentId ? ["admin"] : ["admin", "manager"] },
    { kind: "viewing_booked", title: `WhatsApp · ${p ? propertyText(p) : ""} · ${whenText(opts.at, "en")}`,
      href: opts.requestId ? `/admin/requests/${opts.requestId}` : `/admin/whatsapp/${opts.contactId}`, key: `viewing_booked:${result.activityId}` });
  await audit("viewing_booked_whatsapp", "contact", opts.contactId, { activityId: result.activityId, propertyId: opts.propertyId });
  return result;
}

/** The customer cancels one of their own upcoming viewings; the agent is told (unless it was replaced by a new time). */
export async function cancelOnline(contactId: number, activityId: number, opts: { quiet?: boolean } = {}) {
  const [a] = await db.update(activities).set({ done: true, result: "cancelled" })
    .where(and(eq(activities.id, activityId), eq(activities.contactId, contactId), eq(activities.type, "viewing"), eq(activities.done, false),
      gt(activities.dueAt, new Date()))).returning();
  if (!a) return false;
  if (!opts.quiet) {
    const [r] = a.requestId ? await db.select().from(requests).where(eq(requests.id, a.requestId)) : [];
    await notify({ userIds: [a.userId ?? r?.assignedTo], app: "crm", roles: a.userId || r?.assignedTo ? ["admin"] : ["admin", "manager"] },
      { kind: "viewing_cancelled", title: `${r?.number ?? ""} · ${whenText(a.dueAt!, "en")}`.trim(), href: r ? `/admin/requests/${r.id}` : undefined,
        key: `viewing_cancelled:${a.id}` });
  }
  await audit("viewing_cancelled_online", "request", a.requestId, { activityId: a.id });
  return true;
}

/** ❤ on a suggestion: saved or unsaved; saving tells the agent once (a buying signal). */
export async function toggleSaved(contactId: number, matchId: number) {
  const [row] = await db.select({ m: matches, r: requests, p: properties }).from(matches).innerJoin(requests, eq(matches.requestId, requests.id))
    .innerJoin(properties, eq(matches.propertyId, properties.id))
    .where(and(eq(matches.id, matchId), eq(requests.contactId, contactId), eq(matches.status, "sent")));
  if (!row) return null;
  const removed = await db.delete(savedProperties).where(and(eq(savedProperties.contactId, contactId), eq(savedProperties.propertyId, row.p.id))).returning();
  if (removed.length) return false;
  await db.insert(savedProperties).values({ contactId, propertyId: row.p.id }).onConflictDoNothing();
  await notify({ userIds: [row.r.assignedTo], app: "crm", roles: row.r.assignedTo ? ["admin"] : ["admin", "manager"] },
    { kind: "property_saved", title: `${row.r.number} · ${propertyText(row.p)}`, href: `/admin/requests/${row.r.id}`, key: `saved:${contactId}:${row.p.id}` });
  return true;
}

export async function savedByContact(contactId: number) {
  const rows = await db.select({ id: savedProperties.propertyId }).from(savedProperties).where(eq(savedProperties.contactId, contactId));
  return new Set(rows.map((r) => r.id));
}
