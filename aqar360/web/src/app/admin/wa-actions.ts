"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { activities, contacts, OPEN_STATUSES, requests, settings, waMessages, waTemplates } from "@/db/schema";
import { audit, requireApp } from "@/lib/auth";
import { TEMPLATE_KEYS } from "@/lib/messages";
import { botSettings, DEFAULT_INSTRUCTIONS, deliver, setPaused } from "@/lib/wa-agent";
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
  // A person took over: the agent stops answering this chat (and drops its draft) until someone resumes it.
  await db.update(waMessages).set({ status: "discarded" }).where(and(eq(waMessages.contactId, c.id), eq(waMessages.status, "draft")));
  if ((await botSettings()).enabled) await setPaused(c.id, true, "staff_replied");
  revalidatePath(`/admin/whatsapp/${c.id}`);
}

const idForm = z.object({ contactId: z.coerce.number().int().positive(), id: z.coerce.number().int().positive().optional(), text: z.string().trim().max(4000).optional() });

/** Staff approve the agent's draft (possibly edited): the text and photos go to the customer. */
export async function approveDraft(form: FormData) {
  const user = await requireApp("crm");
  const parsed = idForm.safeParse(Object.fromEntries(form));
  if (!parsed.success || !parsed.data.id || !(await waReady())) return;
  if (!(await windowOpen(parsed.data.contactId))) redirect(`/admin/whatsapp/${parsed.data.contactId}?closed=1`);
  // Claimed in one step, so a double click sends once.
  const [draft] = await db.update(waMessages).set({ status: "sending" }).where(and(eq(waMessages.id, parsed.data.id),
    eq(waMessages.contactId, parsed.data.contactId), eq(waMessages.status, "draft"))).returning();
  if (!draft) return;
  const keep = new Set(form.getAll("photo").map(String));
  const photos = draft.media.filter((m) => keep.has(m.url));
  const text = parsed.data.text ?? draft.body;
  await deliver(draft.contactId!, draft.phone, text, photos, user.id, draft.id);
  await audit("whatsapp_agent_approved", "contact", draft.contactId, { edited: text !== draft.body, photos: photos.length }, user.id);
  revalidatePath(`/admin/whatsapp/${draft.contactId}`);
}

export async function discardDraft(form: FormData) {
  const user = await requireApp("crm");
  const parsed = idForm.safeParse(Object.fromEntries(form));
  if (!parsed.success || !parsed.data.id) return;
  await db.update(waMessages).set({ status: "discarded", userId: user.id }).where(and(eq(waMessages.id, parsed.data.id),
    eq(waMessages.contactId, parsed.data.contactId), eq(waMessages.status, "draft")));
  revalidatePath(`/admin/whatsapp/${parsed.data.contactId}`);
}

/** Pause or resume the agent in one chat. */
export async function toggleAgent(form: FormData) {
  const user = await requireApp("crm");
  const parsed = idForm.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const pause = form.get("pause") === "1";
  await setPaused(parsed.data.contactId, pause, pause ? "staff_paused" : null);
  await audit(pause ? "whatsapp_agent_paused" : "whatsapp_agent_resumed", "contact", parsed.data.contactId, {}, user.id);
  revalidatePath(`/admin/whatsapp/${parsed.data.contactId}`);
}

/** Agent settings (admin and manager): on/off, auto-send or staff approval, when it answers and the daily limit. */
export async function saveAgentSettings(form: FormData) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const parsed = z.object({ mode: z.enum(["auto", "approve"]), hours: z.enum(["always", "after_hours"]), dailyCap: z.coerce.number().int().min(10).max(5000),
    model: z.string().trim().max(200).regex(/^[\w.:/-]*$/).default(""), instructions: z.string().max(6000).default(""), avoid: z.string().max(3000).default("") })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/admin/whatsapp?error=1");
  // The default text is not stored, so later improvements to it reach admins who never changed it.
  const clean = (v: string) => v.replace(/\r\n/g, "\n").trim();
  const own = form.get("reset") === "on" || clean(parsed.data.instructions) === clean(DEFAULT_INSTRUCTIONS) ? "" : clean(parsed.data.instructions);
  const rows = [{ key: "waBotEnabled", value: form.get("enabled") === "on" }, { key: "waBotMode", value: parsed.data.mode },
    { key: "waBotHours", value: parsed.data.hours }, { key: "waBotDailyCap", value: parsed.data.dailyCap }, { key: "waBotModel", value: parsed.data.model },
    { key: "waBotInstructions", value: own }, { key: "waBotAvoid", value: clean(parsed.data.avoid) }];
  await db.insert(settings).values(rows).onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value` } });
  await audit("whatsapp_agent_settings", "settings", null, { enabled: rows[0].value, mode: parsed.data.mode, model: parsed.data.model, customInstructions: !!own }, user.id);
  revalidatePath("/admin/whatsapp");
  redirect("/admin/whatsapp?saved=1");
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
