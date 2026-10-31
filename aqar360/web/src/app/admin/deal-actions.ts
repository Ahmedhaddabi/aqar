"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canSeeRequest } from "@/admin/crm";
import { db } from "@/db";
import { activities, matches, OFFER_STATUSES, offers, projects, projectUnitTypes, properties, requests } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { matchRequest, matchSupply } from "@/lib/matching";
import { sendMessage } from "@/lib/messages";
import { siteUrl } from "@/lib/config";

const id = z.coerce.number().int().positive();
const refresh = (requestId: number) => { revalidatePath(`/admin/requests/${requestId}`); revalidatePath("/admin"); };

async function requestFor(user: Awaited<ReturnType<typeof requireUser>>, requestId: number) {
  if (!(await canSeeRequest(user, requestId))) return null;
  const [r] = await db.select().from(requests).where(eq(requests.id, requestId));
  return r ?? null;
}

export async function rematch(form: FormData) {
  const user = await requireUser();
  const requestId = id.safeParse(form.get("requestId"));
  if (!requestId.success || !(await requestFor(user, requestId.data))) return;
  await matchRequest(requestId.data);
  refresh(requestId.data);
}

/** Approve, reject or mark as sent. Sending also emails the customer when they agreed to property alerts. */
export async function decideMatch(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({ id, decision: z.enum(["approved", "rejected", "sent"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const [m] = await db.select().from(matches).where(eq(matches.id, parsed.data.id));
  const r = m && (await requestFor(user, m.requestId));
  if (!m || !r) return;
  const now = new Date();
  await db.update(matches).set({ status: parsed.data.decision, decidedBy: user.id, decidedAt: now, updatedAt: now,
    ...(parsed.data.decision === "sent" ? { sentAt: now } : {}) }).where(eq(matches.id, m.id));
  if (parsed.data.decision === "sent") {
    await db.insert(activities).values({ requestId: r.id, contactId: r.contactId, userId: user.id, type: "system", body: `match_sent:${m.id}` });
    if (r.status === "new" || r.status === "contacted") {
      await db.update(requests).set({ status: "working", firstResponseAt: r.firstResponseAt ?? now, updatedAt: now }).where(eq(requests.id, r.id));
    }
    const label = await listingLabel(m.propertyId, m.unitTypeId);
    await sendMessage({ key: `match:${m.id}`, template: "match_sent", contactId: r.contactId, requestId: r.id, purpose: "match_alerts",
      vars: { number: r.number, property: label.text, price: m.price ? `${m.price} OMR` : "", link: label.link } });
  }
  await audit(`match_${parsed.data.decision}`, "match", m.id, { requestId: r.id }, user.id);
  refresh(r.id);
}

export async function listingLabel(propertyId: number | null, unitTypeId: number | null) {
  if (propertyId) {
    const [p] = await db.select().from(properties).where(eq(properties.id, propertyId));
    const [proj] = p?.projectId ? await db.select().from(projects).where(eq(projects.id, p.projectId)) : [];
    const text = proj ? `${proj.nameEn} — ${p!.unitNumber ?? p!.code}` : `${p?.kind ?? ""} ${p?.code ?? ""}`.trim();
    const link = proj?.public && proj.verified ? `${siteUrl}/ar/projects/${proj.slug}`
      : p?.public && p.verified ? `${siteUrl}/ar/map?listing=${encodeURIComponent(p.code)}` : "";
    return { text, link };
  }
  const [t] = unitTypeId ? await db.select().from(projectUnitTypes).where(eq(projectUnitTypes.id, unitTypeId)) : [];
  const [proj] = t ? await db.select().from(projects).where(eq(projects.id, t.projectId)) : [];
  return { text: proj ? `${proj.nameEn} — ${t!.type}` : "", link: proj?.public && proj.verified ? `${siteUrl}/ar/projects/${proj.slug}` : "" };
}

export async function bookViewing(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({ requestId: id, propertyId: id.optional(), dueAt: z.string().min(10), body: z.string().max(500).default("") })
    .safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return;
  const r = await requestFor(user, parsed.data.requestId);
  if (!r) return;
  const due = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(parsed.data.dueAt) ? `${parsed.data.dueAt}:00+04:00` : parsed.data.dueAt);
  if (Number.isNaN(due.getTime())) return;
  await db.insert(activities).values({ requestId: r.id, contactId: r.contactId, userId: user.id, type: "viewing", dueAt: due,
    propertyId: parsed.data.propertyId ?? null, body: parsed.data.body });
  if (["new", "contacted", "working"].includes(r.status)) {
    await db.update(requests).set({ status: "viewing", assignedTo: r.assignedTo ?? user.id, firstResponseAt: r.firstResponseAt ?? new Date(),
      updatedAt: new Date() }).where(eq(requests.id, r.id));
  }
  refresh(r.id);
}

export async function setViewingResult(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({ id, result: z.enum(["interested", "not_suitable", "wants_alternatives", "no_show"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const [a] = await db.select().from(activities).where(and(eq(activities.id, parsed.data.id), eq(activities.type, "viewing")));
  if (!a?.requestId || !(await requestFor(user, a.requestId))) return;
  await db.update(activities).set({ result: parsed.data.result, done: true }).where(eq(activities.id, a.id));
  if (parsed.data.result === "interested") {
    await db.update(requests).set({ status: "offer", updatedAt: new Date() }).where(and(eq(requests.id, a.requestId), eq(requests.status, "viewing")));
  }
  refresh(a.requestId);
}

export async function addOffer(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({ requestId: id, propertyId: id.optional(), amount: z.coerce.number().positive(), notes: z.string().max(500).default("") })
    .safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return;
  const r = await requestFor(user, parsed.data.requestId);
  if (!r) return;
  await db.insert(offers).values({ ...parsed.data, propertyId: parsed.data.propertyId ?? null, createdBy: user.id });
  await db.update(requests).set({ status: "offer", updatedAt: new Date() }).where(eq(requests.id, r.id));
  await audit("offer_created", "request", r.id, { amount: parsed.data.amount }, user.id);
  refresh(r.id);
}

export async function setOfferStatus(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({ id, status: z.enum(OFFER_STATUSES), counterAmount: z.coerce.number().positive().optional() })
    .safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return;
  const [o] = await db.select().from(offers).where(eq(offers.id, parsed.data.id));
  const r = o && (await requestFor(user, o.requestId));
  if (!o || !r) return;
  await db.update(offers).set({ status: parsed.data.status, counterAmount: parsed.data.counterAmount ?? o.counterAmount, updatedAt: new Date() })
    .where(eq(offers.id, o.id));
  if (parsed.data.status === "accepted") {
    await db.update(requests).set({ status: "won", updatedAt: new Date() }).where(eq(requests.id, r.id));
    if (o.propertyId) await db.update(properties).set({ status: r.subtype === "Rent" ? "rented" : "sold", updatedAt: new Date() })
      .where(eq(properties.id, o.propertyId));
    if (o.propertyId) await matchSupply({ propertyIds: [o.propertyId] }); // other customers' suggestions for it are withdrawn
  }
  await audit(`offer_${parsed.data.status}`, "offer", o.id, {}, user.id);
  refresh(r.id);
}
