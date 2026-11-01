"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canSeeRequest } from "@/admin/crm";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { audit, requireApp } from "@/lib/auth";

/** Check-in at a viewing (strategy §26.8 staff mobile app): time and phone location saved on the request's timeline. */
export async function checkIn(input: { activityId: number; lat?: number; lng?: number; accuracy?: number }) {
  const user = await requireApp("crm");
  const parsed = z.object({ activityId: z.number().int().positive(), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
    accuracy: z.number().min(0).max(100_000).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const [a] = await db.select().from(activities).where(and(eq(activities.id, parsed.data.activityId)));
  if (!a?.requestId || !(await canSeeRequest(user, a.requestId))) return { ok: false };
  const where = parsed.data.lat != null && parsed.data.lng != null
    ? ` https://maps.google.com/?q=${parsed.data.lat.toFixed(6)},${parsed.data.lng.toFixed(6)} (±${Math.round(parsed.data.accuracy ?? 0)} m)` : "";
  await db.insert(activities).values({ requestId: a.requestId, contactId: a.contactId, userId: user.id, type: "note", body: `📍 check-in${where}`,
    propertyId: a.propertyId, done: true });
  await audit("field_check_in", "request", a.requestId, { activity: a.id, located: !!where }, user.id);
  revalidatePath("/admin/field");
  return { ok: true };
}
