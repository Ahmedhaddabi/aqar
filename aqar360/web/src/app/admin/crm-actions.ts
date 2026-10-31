"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canSeeRequest } from "@/admin/crm";
import { db } from "@/db";
import { ACTIVITY_TYPES, activities, contacts, REQUEST_STATUSES, requests, users } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { normalizePhone } from "@/lib/intake";
import { matchRequest } from "@/lib/matching";
import { notify } from "@/lib/notify";

const id = z.coerce.number().int().positive();

/** The first call, message, email or status change counts as the first reply to the customer. */
async function markFirstResponse(requestId: number) {
  await db.update(requests).set({ firstResponseAt: new Date() })
    .where(and(eq(requests.id, requestId), isNull(requests.firstResponseAt)));
}

function refresh(requestId?: number, contactId?: number) {
  revalidatePath("/admin");
  revalidatePath("/admin/requests");
  if (requestId) revalidatePath(`/admin/requests/${requestId}`);
  if (contactId) revalidatePath(`/admin/customers/${contactId}`);
}

export async function changeStatus(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({ id, status: z.enum(REQUEST_STATUSES), reason: z.string().trim().max(300).optional() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success || !(await canSeeRequest(user, parsed.data.id))) return;
  const [r] = await db.select().from(requests).where(eq(requests.id, parsed.data.id));
  if (!r || r.status === parsed.data.status) return;
  const closing = parsed.data.status === "closed";
  await db.update(requests).set({ status: parsed.data.status, updatedAt: new Date(),
    ...(closing ? { closedReason: parsed.data.reason || null } : {}),
    // Picking up an unassigned request by working on it makes it yours.
    ...(r.assignedTo ? {} : { assignedTo: user.id }) }).where(eq(requests.id, r.id));
  if (r.status === "new") await markFirstResponse(r.id);
  await db.insert(activities).values({ requestId: r.id, contactId: r.contactId, userId: user.id, type: "status",
    body: `${r.status}>${parsed.data.status}${closing && parsed.data.reason ? `|${parsed.data.reason}` : ""}` });
  await audit("request_status", "request", r.id, { from: r.status, to: parsed.data.status }, user.id);
  if (["won", "closed"].includes(parsed.data.status) || ["won", "closed"].includes(r.status)) await matchRequest(r.id);
  refresh(r.id, r.contactId);
}

export async function assignRequest(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({ id, to: z.union([z.literal("me"), id]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success || !(await canSeeRequest(user, parsed.data.id))) return;
  const target = parsed.data.to === "me" ? user.id : parsed.data.to;
  // Agents can only take a request for themselves; managers and admins can assign anyone.
  if (user.role === "agent" && target !== user.id) return;
  const [staff] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, target), eq(users.active, true)));
  if (!staff) return;
  const [r] = await db.select().from(requests).where(eq(requests.id, parsed.data.id));
  await db.update(requests).set({ assignedTo: target, updatedAt: new Date() }).where(eq(requests.id, r.id));
  await audit("request_assigned", "request", r.id, { to: target }, user.id);
  if (target !== user.id) await notify({ userIds: [target] }, { kind: "request_assigned", title: r.number, href: `/admin/requests/${r.id}` });
  refresh(r.id, r.contactId);
}

export async function addActivity(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    requestId: id.optional(), contactId: id, type: z.enum(ACTIVITY_TYPES).exclude(["status", "system"]),
    body: z.string().trim().max(2000).default(""), dueAt: z.string().optional(),
  }).safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return;
  const { requestId, contactId, type, body, dueAt } = parsed.data;
  if (requestId && !(await canSeeRequest(user, requestId))) return;
  // The date picker sends local wall-clock time; staff work in Oman (UTC+4, no daylight saving), the server in UTC.
  const due = dueAt ? new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueAt) ? `${dueAt}:00+04:00` : dueAt) : null;
  if (!body && !due) return;
  await db.insert(activities).values({ requestId: requestId ?? null, contactId, userId: user.id, type, body,
    dueAt: due && !Number.isNaN(due.getTime()) ? due : null });
  if (requestId && ["call", "whatsapp", "email"].includes(type)) await markFirstResponse(requestId);
  if (requestId) {
    if (type === "viewing") {
      await db.update(requests).set({ status: "viewing", updatedAt: new Date() })
        .where(and(eq(requests.id, requestId), eq(requests.status, "working")));
    }
    await db.update(requests).set({ updatedAt: new Date() }).where(eq(requests.id, requestId));
  }
  refresh(requestId, contactId);
}

export async function completeActivity(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({ id }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const [a] = await db.select().from(activities).where(eq(activities.id, parsed.data.id));
  if (!a || (a.requestId && !(await canSeeRequest(user, a.requestId)))) return;
  await db.update(activities).set({ done: true }).where(eq(activities.id, a.id));
  refresh(a.requestId ?? undefined, a.contactId);
}

export async function updateCustomer(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({ id, name: z.string().trim().min(1).max(120), phone: z.string().trim().max(30),
    email: z.union([z.literal(""), z.string().trim().toLowerCase().email()]), notes: z.string().trim().max(4000) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { name, phone, email, notes } = parsed.data;
  const [visible] = await db.select({ id: requests.id }).from(requests).where(eq(requests.contactId, parsed.data.id)).limit(1);
  if (user.role === "agent" && (!visible || !(await canSeeRequest(user, visible.id)))) return;
  await db.update(contacts).set({ name, phone: normalizePhone(phone) ?? (phone || null), email: email || null, notes,
    updatedAt: new Date() }).where(eq(contacts.id, parsed.data.id));
  await audit("customer_updated", "contact", parsed.data.id, {}, user.id);
  refresh(undefined, parsed.data.id);
}
