// Field app actions recorded on the phone (also without signal) and sent when it is back online. Each action has the
// phone's own id: an action sent twice (retry after a weak connection) is applied once.
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { canSeeRequest } from "@/admin/crm";
import { db } from "@/db";
import { activities, auditLog, requests } from "@/db/schema";

import type { CurrentUser } from "./auth";

export const FieldOp = z.discriminatedUnion("type", [
  z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/), type: z.literal("checkin"), activityId: z.number().int().positive(), at: z.string().datetime(),
    lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(), accuracy: z.number().min(0).max(100_000).optional() }),
  z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/), type: z.literal("result"), activityId: z.number().int().positive(), at: z.string().datetime(),
    result: z.enum(["interested", "not_suitable", "wants_alternatives", "no_show"]) }),
  z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/), type: z.literal("note"), activityId: z.number().int().positive(), at: z.string().datetime(),
    text: z.string().trim().min(1).max(2000) }),
]);
export type FieldOp = z.infer<typeof FieldOp>;

const hhmm = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: "Asia/Muscat" }).format(new Date(iso));

/** "done" = applied now or earlier; "denied" = not this person's or no longer possible (the phone drops it). */
export async function applyFieldOp(user: CurrentUser, op: FieldOp): Promise<"done" | "denied"> {
  const [seen] = await db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, "field_op"), eq(auditLog.entityId, op.id)));
  if (seen) return "done";
  const [a] = await db.select().from(activities).where(eq(activities.id, op.activityId));
  if (!a?.requestId || !(await canSeeRequest(user, a.requestId))) return "denied";
  const late = Date.now() - new Date(op.at).getTime() > 5 * 60_000 ? ` (${hhmm(op.at)}, sent later)` : "";
  if (op.type === "checkin") {
    const where = op.lat != null && op.lng != null ? ` https://maps.google.com/?q=${op.lat.toFixed(6)},${op.lng.toFixed(6)} (±${Math.round(op.accuracy ?? 0)} m)` : "";
    await db.insert(activities).values({ requestId: a.requestId, contactId: a.contactId, userId: user.id, type: "note", body: `📍 check-in${late}${where}`,
      propertyId: a.propertyId, done: true });
  } else if (op.type === "result") {
    if (a.type !== "viewing") return "denied";
    const [set] = await db.update(activities).set({ result: op.result, done: true }).where(and(eq(activities.id, a.id), isNull(activities.result))).returning();
    if (set && op.result === "interested") {
      await db.update(requests).set({ status: "offer", updatedAt: new Date() }).where(and(eq(requests.id, a.requestId), eq(requests.status, "viewing")));
    }
  } else {
    await db.insert(activities).values({ requestId: a.requestId, contactId: a.contactId, userId: user.id, type: "note", body: `${op.text}${late}`,
      propertyId: a.propertyId, done: true });
  }
  // The phone's id in entity_id is how a repeat is recognised above.
  await db.insert(auditLog).values({ action: "field_op", entity: "field", entityId: op.id, data: { type: op.type, activityId: op.activityId }, userId: user.id });
  return "done";
}
