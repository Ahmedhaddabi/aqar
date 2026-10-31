"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { activities, consents, contacts, REQUEST_KINDS, requests, settings } from "@/db/schema";
import { audit, requireApp } from "@/lib/auth";
import { normalizePhone } from "@/lib/intake";
import { matchRequest } from "@/lib/matching";

const optNum = z.coerce.number().min(0).max(100_000_000).optional().or(z.literal("").transform(() => undefined));
const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

/**
 * A customer (and optionally a request) recorded by staff from a call, WhatsApp chat or walk-in. Same phone = same
 * customer (no duplicates); the source is kept for offline attribution (strategy §27.7).
 */
export async function createEntry(form: FormData) {
  const user = await requireApp("crm");
  const parsed = z.object({
    name: z.string().trim().min(2).max(120), phone: z.string().trim().min(6).max(30), email: optText(160).pipe(z.string().email().optional()),
    language: z.enum(["ar", "en"]).default("ar"), source: z.string().trim().max(40).default("Phone call"),
    kind: z.enum(["none", ...REQUEST_KINDS]).default("none"), subtype: optText(40), propertyType: optText(40), budgetMin: optNum, budgetMax: optNum,
    bedrooms: z.coerce.number().int().min(0).max(20).optional().or(z.literal("").transform(() => undefined)), timing: optText(40),
    notes: z.string().trim().max(2000).default(""),
  }).safeParse(Object.fromEntries([...form.entries()].filter(([k]) => !["areas", "consent", "assignMe"].includes(k))));
  const phone = parsed.success ? normalizePhone(parsed.data.phone) : null;
  if (!parsed.success || !phone) redirect("/admin/requests/new?error=1");
  const v = parsed.data;

  const [existing] = await db.select().from(contacts).where(eq(contacts.phone, phone)).limit(1);
  const contactId = existing?.id ?? (await db.insert(contacts).values({ name: v.name, phone, email: v.email?.toLowerCase() ?? null, language: v.language,
    source: v.source }).returning({ id: contacts.id }))[0].id;
  if (existing && !existing.email && v.email) await db.update(contacts).set({ email: v.email.toLowerCase() }).where(eq(contacts.id, existing.id));
  await audit(existing ? "customer_matched_by_staff" : "customer_created_by_staff", "contact", contactId, { source: v.source }, user.id);
  if (v.kind === "none") redirect(`/admin/customers/${contactId}${existing ? "?existing=1" : ""}`);

  const [setting] = await db.select().from(settings).where(eq(settings.key, "requestValidDays"));
  const validDays = Number(setting?.value) || 90;
  const areaIds = form.getAll("areas").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const now = new Date();
  const [request] = await db.insert(requests).values({
    number: sql`'REQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('request_number_seq')::text, 5, '0')`,
    kind: v.kind, subtype: v.subtype ?? null, contactId, propertyType: v.propertyType ?? null, areaIds, budgetMin: v.budgetMin ?? null,
    budgetMax: v.budgetMax ?? null, bedroomsMin: v.bedrooms ?? null, timing: v.timing ?? null, notes: v.notes, language: v.language,
    // The customer is already talking to us: first reply done, status "contacted".
    status: "contacted", firstResponseAt: now, assignedTo: form.get("assignMe") === "on" ? user.id : null,
    sourceChannel: v.source, details: { entered_by_staff: true }, expiresOn: sql`(current_date + ${validDays}::int)`,
  }).returning();
  await db.insert(activities).values({ requestId: request.id, contactId, userId: user.id, type: v.source === "WhatsApp" ? "whatsapp" : "call",
    body: v.notes || v.source });
  // Consent the customer gave on the call, recorded with who took it and how (strategy §12, F.4).
  const channels = form.getAll("consent").map(String).filter((c) => ["phone", "whatsapp", "email"].includes(c));
  if (channels.length) {
    await db.insert(consents).values(channels.map((channel) => ({ contactId, purpose: "request_updates" as const, channel, granted: true, source: "staff",
      evidence: `${request.number} recorded by ${user.name} (${v.source})` })));
  }
  await audit("request_created_by_staff", "request", request.id, { source: v.source }, user.id);
  if (request.kind === "search") await matchRequest(request.id).catch((e) => console.error("matching failed:", (e as Error).message));
  redirect(`/admin/requests/${request.id}${existing ? "?existing=1" : ""}`);
}
