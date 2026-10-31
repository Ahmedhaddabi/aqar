"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { canSeeRequest } from "@/admin/crm";
import { db } from "@/db";
import { activities, contacts, properties, requests } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { sendMessage } from "@/lib/messages";
import { textToHtml } from "@/lib/text";

const id = z.coerce.number().int().positive();

/**
 * Owner opportunity accepted (strategy §5.3): a draft property (not on the website, not verified) is created from what
 * the owner submitted, so staff only complete and publish it. "Content only" keeps it off the market.
 */
export async function acceptOpportunity(form: FormData) {
  const user = await requireUser(["admin", "manager"]);
  const parsed = z.object({ id, mode: z.enum(["content", "market"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const [row] = await db.select({ r: requests, c: contacts }).from(requests).innerJoin(contacts, eq(requests.contactId, contacts.id))
    .where(eq(requests.id, parsed.data.id));
  if (!row || row.r.kind !== "listing") return;
  const { r, c } = row;
  const d = r.details as Record<string, unknown>;
  const rent = r.subtype === "Let";
  const [property] = await db.insert(properties).values({
    code: sql`'AQ-' || lpad(nextval('property_code_seq')::text, 5, '0')`,
    title: `${r.propertyType ?? "Property"} · ${c.name} (${r.number})`, kind: r.propertyType ?? "Apartment", purpose: rent ? "rent" : "sale",
    salePrice: rent ? null : r.budgetMax, rentPrice: rent ? r.budgetMax : null, bedrooms: r.bedroomsMin,
    bathrooms: typeof d.bathrooms === "number" ? d.bathrooms : null, sizeSqm: typeof d.size_sqm === "number" ? d.size_sqm : null,
    areaId: r.areaIds[0] ?? null, ownerName: c.name, ownerPhone: c.phone, public: false, verified: false,
    status: parsed.data.mode === "market" ? "available" : "hidden", descriptionEn: textToHtml(r.notes ?? ""),
  }).returning({ id: properties.id, code: properties.code });
  await db.update(requests).set({ status: "working", updatedAt: new Date(),
    details: { ...d, review: { decision: "accepted", mode: parsed.data.mode, propertyId: property.id, by: user.id, at: new Date().toISOString() } } })
    .where(eq(requests.id, r.id));
  await db.insert(activities).values({ requestId: r.id, contactId: c.id, userId: user.id, type: "status", propertyId: property.id,
    body: `opportunity_accepted:${parsed.data.mode} ${property.code}` });
  await audit("opportunity_accepted", "request", r.id, { mode: parsed.data.mode, property: property.id }, user.id);
  revalidatePath(`/admin/requests/${r.id}`);
  redirect(`/admin/requests/${r.id}?accepted=${property.id}`);
}

/** Not selected (strategy §2.3): an internal reason, an optional polite message, the request closed. */
export async function declineOpportunity(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({ id, reason: z.enum(["price", "quality", "location", "documents", "capacity", "other"]), send: z.string().optional() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success || user.role === "agent" && !(await canSeeRequest(user, parsed.data.id))) return;
  const [r] = await db.select().from(requests).where(eq(requests.id, parsed.data.id));
  if (!r || r.kind !== "listing") return;
  await db.update(requests).set({ status: "closed", closedReason: `not_selected:${parsed.data.reason}`, updatedAt: new Date(),
    details: { ...(r.details as Record<string, unknown>), review: { decision: "not_selected", reason: parsed.data.reason, by: user.id, at: new Date().toISOString() } } })
    .where(eq(requests.id, r.id));
  await db.insert(activities).values({ requestId: r.id, contactId: r.contactId, userId: user.id, type: "status", body: `opportunity_not_selected:${parsed.data.reason}` });
  if (parsed.data.send) {
    await sendMessage({ key: `not_selected:${r.id}`, template: "not_selected", contactId: r.contactId, requestId: r.id, purpose: "request_updates",
      vars: { number: r.number } }).catch(() => undefined);
  }
  await audit("opportunity_not_selected", "request", r.id, { reason: parsed.data.reason }, user.id);
  revalidatePath(`/admin/requests/${r.id}`);
  redirect(`/admin/requests/${r.id}?declined=1`);
}
