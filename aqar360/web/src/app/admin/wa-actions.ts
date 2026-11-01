"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { activities, contacts, OPEN_STATUSES, requests, waTemplates } from "@/db/schema";
import { audit, requireApp } from "@/lib/auth";
import { TEMPLATE_KEYS } from "@/lib/messages";
import { recordOut, sendText, waReady, windowOpen } from "@/lib/whatsapp";

/** Staff reply in the conversation: free text, allowed only within 24 hours of the customer's last message. */
export async function replyWhatsApp(form: FormData) {
  const user = await requireApp("crm");
  const parsed = z.object({ contactId: z.coerce.number().int().positive(), text: z.string().trim().min(1).max(4000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success || !(await waReady())) return;
  const [c] = await db.select().from(contacts).where(eq(contacts.id, parsed.data.contactId));
  if (!c?.phone) return;
  if (!(await windowOpen(c.id))) redirect(`/admin/whatsapp/${c.id}?closed=1`);
  const result = await sendText(c.phone, parsed.data.text);
  await recordOut(c.id, c.phone, parsed.data.text, result, user.id);
  const [open] = await db.select().from(requests).where(and(eq(requests.contactId, c.id), inArray(requests.status, [...OPEN_STATUSES])))
    .orderBy(desc(requests.updatedAt)).limit(1);
  await db.insert(activities).values({ requestId: open?.id ?? null, contactId: c.id, userId: user.id, type: "whatsapp", body: `➡ ${parsed.data.text}`, done: true });
  if (open && !open.firstResponseAt) await db.update(requests).set({ firstResponseAt: new Date(), status: open.status === "new" ? "contacted" : open.status })
    .where(eq(requests.id, open.id));
  await audit(result.ok ? "whatsapp_sent" : "whatsapp_failed", "contact", c.id, {}, user.id);
  revalidatePath(`/admin/whatsapp/${c.id}`);
}

/** Map one of our messages to the template approved in WhatsApp Manager (name and the order of its {{1}}, {{2}} variables). */
export async function saveWaTemplate(form: FormData) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const parsed = z.object({ key: z.enum(TEMPLATE_KEYS), name: z.string().trim().regex(/^[a-z0-9_]{1,512}$/).or(z.literal("")),
    params: z.string().max(300).default("") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/admin/messages?tab=whatsapp&error=1");
  const params = parsed.data.params.split(",").map((p) => p.trim().replace(/[{}\s]/g, "")).filter(Boolean).slice(0, 10);
  const enabled = form.get("enabled") === "on" && !!parsed.data.name;
  await db.insert(waTemplates).values({ key: parsed.data.key, name: parsed.data.name, params, enabled })
    .onConflictDoUpdate({ target: waTemplates.key, set: { name: parsed.data.name, params, enabled, updatedAt: sql`now()` } });
  await audit("wa_template_saved", "wa_template", parsed.data.key, { enabled }, user.id);
  revalidatePath("/admin/messages");
}
