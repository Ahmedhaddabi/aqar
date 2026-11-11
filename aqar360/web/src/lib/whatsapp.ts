// WhatsApp Business (Meta Cloud API). POST https://graph.facebook.com/{version}/{phone-number-id}/messages with
// "Authorization: Bearer <token>". Messages the business starts must use templates approved in WhatsApp Manager;
// free text is allowed only within 24 hours of the customer's last message (customer service window).
// Webhooks: GET verification (hub.mode / hub.verify_token / hub.challenge); POST signed with
// X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body).
import { createHmac, timingSafeEqual } from "node:crypto";

import { and, desc, eq, gt, inArray } from "drizzle-orm";

import { db } from "@/db";
import { activities, consents, contacts, outbox, requests, OPEN_STATUSES, waMessages, waTemplates } from "@/db/schema";

import { integrationConfig } from "./integrations";
import { notify } from "./notify";

/** Keys from Admin → Integrations (or the server environment); empty while WhatsApp is off. */
export async function waConfig() {
  const c = await integrationConfig("whatsapp");
  return { token: c?.token ?? "", phoneNumberId: c?.phoneNumberId ?? "", appSecret: c?.appSecret ?? "", verifyToken: c?.verifyToken ?? "",
    version: c?.apiVersion || "v23.0" };
}
export const waReady = async () => { const c = await waConfig(); return !!(c.token && c.phoneNumberId); };

const digits = (phone: string) => phone.replace(/[^\d]/g, "");
const WINDOW_MS = 24 * 3_600_000;

type SendResult = { ok: true; id: string } | { ok: false; error: string };

async function post(body: Record<string, unknown>): Promise<SendResult> {
  const c = await waConfig();
  try {
    const res = await fetch(`https://graph.facebook.com/${c.version}/${c.phoneNumberId}/messages`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }),
    });
    const json = await res.json().catch(() => ({}));
    const id = json?.messages?.[0]?.id;
    return res.ok && id ? { ok: true, id } : { ok: false, error: `${res.status} ${json?.error?.message ?? ""}`.trim().slice(0, 300) };
  } catch (error) {
    return { ok: false, error: `network ${(error as Error).message}`.slice(0, 300) };
  }
}

/** The approved template for one of our messages, with its variables filled in Meta's {{1}}, {{2}} order. */
export async function sendTemplate(phone: string, key: string, lang: "ar" | "en", vars: Record<string, string>): Promise<SendResult> {
  const [tpl] = await db.select().from(waTemplates).where(eq(waTemplates.key, key));
  if (!tpl?.enabled) return { ok: false, error: "no_template" };
  return post({ to: digits(phone), type: "template", template: { name: tpl.name, language: { code: lang },
    components: tpl.params.length ? [{ type: "body", parameters: tpl.params.map((p) => ({ type: "text", text: (vars[p] ?? "-").slice(0, 1000) })) }] : [] } });
}

/** Free text: only inside the 24-hour window after the customer's last message. */
export async function sendText(phone: string, text: string): Promise<SendResult> {
  return post({ to: digits(phone), type: "text", text: { body: text.slice(0, 4096), preview_url: true } });
}

/** A photo by its public https link (Meta downloads it); the caption shows under the photo. */
export async function sendImage(phone: string, link: string, caption?: string): Promise<SendResult> {
  return post({ to: digits(phone), type: "image", image: { link, ...(caption ? { caption: caption.slice(0, 1024) } : {}) } });
}

export async function windowOpen(contactId: number) {
  const [last] = await db.select({ at: waMessages.createdAt }).from(waMessages)
    .where(and(eq(waMessages.contactId, contactId), eq(waMessages.direction, "in"))).orderBy(desc(waMessages.createdAt)).limit(1);
  return !!last && Date.now() - last.at.getTime() < WINDOW_MS;
}

export async function recordOut(contactId: number | null, phone: string, body: string, result: SendResult, userId: number | null = null,
  extra: { bot?: boolean; media?: { url: string; caption?: string }[] } = {}) {
  await db.insert(waMessages).values({ contactId, direction: "out", phone, body, waId: result.ok ? result.id : null,
    status: result.ok ? "sent" : "failed", error: result.ok ? null : result.error, userId, bot: extra.bot ?? false, media: extra.media ?? [] });
}

export async function validSignature(raw: string, header: string | null) {
  const { appSecret } = await waConfig();
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(raw).digest("hex"));
  const given = Buffer.from(header.slice(7).toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type WebhookValue = {
  messages?: { from: string; id: string; timestamp?: string; type?: string; text?: { body?: string }; button?: { text?: string };
    interactive?: { button_reply?: { title?: string } } }[];
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  statuses?: { id: string; status: string; recipient_id?: string; errors?: { code?: number; title?: string; message?: string }[] }[];
};

const STOP = /^(stop|unsubscribe|ايقاف|إيقاف|الغاء|إلغاء|توقف)$/i;

/**
 * Incoming messages land on the customer's file (and their open request); delivery receipts update what we sent.
 * Returns the new customer messages the WhatsApp agent may answer (newest per customer).
 */
export async function handleWebhook(payload: { entry?: { changes?: { field?: string; value?: WebhookValue }[] }[] }) {
  let handled = 0;
  const inbound = new Map<number, number>(); // contact → newest message id
  for (const change of payload.entry?.flatMap((e) => e.changes ?? []) ?? []) {
    const v = change.value ?? {};
    for (const st of v.statuses ?? []) {
      const error = st.errors?.[0] ? `${st.errors[0].code ?? ""} ${st.errors[0].title ?? st.errors[0].message ?? ""}`.trim() : null;
      await db.update(waMessages).set({ status: st.status, error }).where(eq(waMessages.waId, st.id));
      if (["delivered", "read", "failed"].includes(st.status)) {
        await db.update(outbox).set({ status: st.status === "failed" ? "failed" : (st.status as "delivered" | "read"), ...(error ? { reason: error } : {}) })
          .where(eq(outbox.providerId, st.id));
      }
      handled++;
    }
    for (const m of v.messages ?? []) {
      const phone = `+${digits(m.from)}`;
      const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? `[${m.type ?? "message"}]`;
      const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
      let [contact] = await db.select().from(contacts).where(eq(contacts.phone, phone)).limit(1);
      if (!contact) [contact] = await db.insert(contacts).values({ name: name || phone, phone, source: "WhatsApp" }).returning();
      const inserted = await db.insert(waMessages).values({ contactId: contact.id, direction: "in", phone, body: text, waId: m.id }).onConflictDoNothing().returning();
      if (!inserted.length) continue; // Meta retries: the same message is stored once
      inbound.set(contact.id, inserted[0].id);
      const [open] = await db.select().from(requests).where(and(eq(requests.contactId, contact.id), inArray(requests.status, [...OPEN_STATUSES])))
        .orderBy(desc(requests.updatedAt)).limit(1);
      await db.insert(activities).values({ requestId: open?.id ?? null, contactId: contact.id, type: "whatsapp", body: `⬅ ${text}`, done: true });
      if (STOP.test(text.trim())) {
        // Opt-out on WhatsApp is immediate for every purpose (strategy F.4).
        await db.insert(consents).values(["request_updates", "match_alerts", "marketing"].map((purpose) => ({ contactId: contact.id,
          purpose: purpose as "request_updates", channel: "whatsapp", granted: false, source: "whatsapp_stop", evidence: `"${text}" ${m.id}` })));
      }
      await notify({ userIds: [open?.assignedTo], app: "crm", roles: open?.assignedTo ? ["admin"] : ["admin", "manager"] },
        { kind: "whatsapp_in", title: `${contact.name}: ${text.slice(0, 80)}`, href: `/admin/whatsapp/${contact.id}`, key: `wa_in:${m.id}` });
      handled++;
    }
  }
  return { handled, inbound: [...inbound].map(([contactId, messageId]) => ({ contactId, messageId })) };
}

/** Conversations for the inbox: customers with WhatsApp messages, newest first. */
export async function conversations(limit = 100) {
  const rows = await db.select({ m: waMessages, c: contacts }).from(waMessages).innerJoin(contacts, eq(waMessages.contactId, contacts.id))
    .where(gt(waMessages.createdAt, new Date(Date.now() - 180 * 86_400_000))).orderBy(desc(waMessages.createdAt)).limit(2000);
  // Rows are newest first: unread = customer messages after our last reply.
  const seen = new Map<number, { contact: typeof contacts.$inferSelect; last: typeof waMessages.$inferSelect; unread: number; replied: boolean }>();
  for (const { m, c } of rows) {
    if (m.status === "draft" || m.status === "discarded") continue; // the agent's unsent drafts are not replies
    const entry = seen.get(c.id) ?? { contact: c, last: m, unread: 0, replied: false };
    seen.set(c.id, entry);
    if (m.direction === "out") entry.replied = true;
    else if (!entry.replied) entry.unread++;
  }
  return [...seen.values()].slice(0, limit);
}
