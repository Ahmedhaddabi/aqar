import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { canSeeRequest } from "@/admin/crm";
import { db } from "@/db";
import { activities, auditLog, documents } from "@/db/schema";
import { canOpen, currentUser } from "@/lib/auth";
import { reject, sameOrigin } from "@/lib/request";
import { uploadImage } from "@/lib/storage";

/** A photo taken in the field (possibly without signal, sent later): kept in the request's documents, once per photo id. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject(403, "not_permitted", "Cross-site requests are not allowed.");
  const user = await currentUser();
  if (!user || !canOpen(user, "crm")) return reject(401, "not_signed_in", "Please sign in again.");
  const form = await request.formData().catch(() => null);
  const id = String(form?.get("id") ?? "");
  const activityId = Number(form?.get("activityId"));
  const at = String(form?.get("at") ?? "");
  const file = form?.get("file");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id) || !Number.isInteger(activityId) || !(file instanceof File) || file.size > 4 * 1024 * 1024) {
    return reject(400, "invalid_request", "Invalid photo.");
  }
  const reply = (status: "done" | "denied") => NextResponse.json({ ok: true, data: { status } }, { headers: { "Cache-Control": "no-store" } });
  const [seen] = await db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, "field_op"), eq(auditLog.entityId, id)));
  if (seen) return reply("done");
  const [a] = await db.select().from(activities).where(eq(activities.id, activityId));
  if (!a?.requestId || !(await canSeeRequest(user, a.requestId))) return reply("denied");
  const stored = await uploadImage(file, "docs");
  if (!stored.ok) return reject(stored.error === "storage" ? 503 : 400, "upload_failed", "The photo could not be stored.");
  const taken = /^\d{4}-\d{2}-\d{2}T/.test(at) ? new Date(at) : new Date();
  const label = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Muscat" }).format(taken);
  const [doc] = await db.insert(documents).values({ ownerType: "request", ownerId: a.requestId, title: `Field photo · ${label}`, category: "field_photo",
    url: stored.url, mime: file.type.slice(0, 80), size: file.size, uploadedBy: user.id }).returning({ id: documents.id });
  await db.insert(activities).values({ requestId: a.requestId, contactId: a.contactId, userId: user.id, type: "note", body: `📷 photo (${label})`,
    propertyId: a.propertyId, done: true });
  await db.insert(auditLog).values({ action: "field_op", entity: "field", entityId: id, data: { type: "photo", activityId, document: doc.id }, userId: user.id });
  return reply("done");
}
