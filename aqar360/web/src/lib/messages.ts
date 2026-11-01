// Customer messages: editable templates, one outbox row per message (never sent twice), consent checked first.
// Email goes through Resend once it is connected in Admin → Integrations; otherwise messages are logged as "skipped".
import { and, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  activities, consents, contacts, invoices, messageTemplates, OPEN_STATUSES, outbox, properties, requests, settings,
} from "@/db/schema";

import { siteUrl } from "./config";
import { docLink } from "./doc-link";
import { integrationConfig } from "./integrations";

export const TEMPLATE_KEYS = ["received", "match_sent", "viewing_reminder", "still_searching", "request_expiring",
  "invoice_sent", "payment_reminder", "job_brief", "job_review", "not_selected", "portal_link", "viewing_booked"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Draft wording (the customer edits it in Admin → Messages). Variables: {{name}}, {{number}}, {{link}}, … */
export const DEFAULT_TEMPLATES: Record<TemplateKey, Record<"ar" | "en", { subject: string; body: string }>> = {
  received: {
    ar: { subject: "{{company}}: استلمنا طلبك {{number}}", body: "مرحبا {{name}}،\nشكرا لتواصلك معنا. تم استلام طلبك رقم {{number}} وسيتواصل معك فريقنا قريبا.\nيمكنك متابعة طلبك أو تعديله من هنا: {{link}}" },
    en: { subject: "{{company}}: we received your request {{number}}", body: "Hello {{name}},\nThank you for contacting us. Your request {{number}} has been received and our team will contact you soon.\nFollow or update your request here: {{link}}" },
  },
  match_sent: {
    ar: { subject: "{{company}}: عقار مقترح لطلبك {{number}}", body: "مرحبا {{name}}،\nوجدنا عقارا قد يناسبك: {{property}} — {{price}}.\n{{link}}\nاحجز موعد المعاينة أو احفظ العقار من حسابك: {{portal}}" },
    en: { subject: "{{company}}: a property for your request {{number}}", body: "Hello {{name}},\nWe found a property that may suit you: {{property}} — {{price}}.\n{{link}}\nBook a viewing or save it from your account: {{portal}}" },
  },
  viewing_booked: {
    ar: { subject: "{{company}}: تم حجز موعد المعاينة", body: "مرحبا {{name}}،\nتم تأكيد موعد معاينة {{property}} يوم {{when}}.\nيمكنك تغيير الموعد أو إلغاؤه من حسابك: {{portal}}" },
    en: { subject: "{{company}}: your viewing is booked", body: "Hello {{name}},\nYour viewing of {{property}} is confirmed for {{when}}.\nYou can change or cancel it from your account: {{portal}}" },
  },
  viewing_reminder: {
    ar: { subject: "{{company}}: تذكير بموعد المعاينة", body: "مرحبا {{name}}،\nنذكّرك بموعد المعاينة {{when}}.\nإذا رغبت في تغيير الموعد يرجى التواصل معنا." },
    en: { subject: "{{company}}: viewing reminder", body: "Hello {{name}},\nA reminder of your viewing {{when}}.\nIf you need to change the time, please contact us." },
  },
  still_searching: {
    ar: { subject: "{{company}}: هل ما زلت تبحث؟ ({{number}})", body: "مرحبا {{name}}،\nما زلنا نعمل على طلبك رقم {{number}}. هل تغير شيء في الميزانية أو المناطق؟ حدّث طلبك من هنا: {{link}}" },
    en: { subject: "{{company}}: are you still looking? ({{number}})", body: "Hello {{name}},\nWe are still working on your request {{number}}. Has anything changed — budget or areas? Update it here: {{link}}" },
  },
  request_expiring: {
    ar: { subject: "{{company}}: طلبك {{number}} ينتهي قريبا", body: "مرحبا {{name}}،\nينتهي طلبك رقم {{number}} في {{date}}. لإبقائه نشطا حدّثه من هنا: {{link}}" },
    en: { subject: "{{company}}: your request {{number}} expires soon", body: "Hello {{name}},\nYour request {{number}} expires on {{date}}. To keep it active, update it here: {{link}}" },
  },
  invoice_sent: {
    ar: { subject: "{{company}}: {{document}} رقم {{number}}", body: "مرحبا {{name}}،\nمرفق {{document}} رقم {{number}} بمبلغ {{amount}}.\nللاطلاع: {{link}}" },
    en: { subject: "{{company}}: {{document}} {{number}}", body: "Hello {{name}},\nPlease find {{document}} {{number}} for {{amount}}.\nView it here: {{link}}" },
  },
  payment_reminder: {
    ar: { subject: "{{company}}: تذكير بسداد الفاتورة {{number}}", body: "مرحبا {{name}}،\nكان موعد سداد الفاتورة {{number}} بمبلغ {{amount}} في {{date}}. إذا كنت قد سددتها فشكرا لك ويرجى تجاهل هذه الرسالة." },
    en: { subject: "{{company}}: payment reminder for invoice {{number}}", body: "Hello {{name}},\nInvoice {{number}} for {{amount}} was due on {{date}}. If you have already paid, thank you and please ignore this message." },
  },
  job_brief: {
    ar: { subject: "{{company}}: نحتاج تفاصيل العمل {{number}}", body: "مرحبا {{name}}،\nشكرا لك. لنبدأ العمل ({{service}}) نحتاج بعض التفاصيل: العنوان، الأوقات المناسبة، وشخص التواصل في الموقع.\nأرسلها من هنا: {{link}}" },
    en: { subject: "{{company}}: details needed for job {{number}}", body: "Hello {{name}},\nThank you. To start your job ({{service}}) we need a few details: address, suitable times and the contact person on site.\nSend them here: {{link}}" },
  },
  job_review: {
    ar: { subject: "{{company}}: التسليم جاهز للمراجعة ({{number}})", body: "مرحبا {{name}}،\nأصبح التسليم جاهزا: {{service}}.\nراجعه واعتمده أو اطلب تعديلات من هنا: {{link}}" },
    en: { subject: "{{company}}: your delivery is ready ({{number}})", body: "Hello {{name}},\nYour delivery is ready: {{service}}.\nReview and approve it, or ask for changes, here: {{link}}" },
  },
  not_selected: {
    ar: { subject: "{{company}}: بخصوص طلبك {{number}}", body: "مرحبا {{name}}،\nشكرا لثقتك بنا. بعد مراجعة طلبك رقم {{number}} لن نتمكن من تقديم الخدمة له في الوقت الحالي.\nيسعدنا مساعدتك لاحقا، ويمكنك حجز استشارة لتقييم الجاهزية أو تحديث معلومات العقار في أي وقت." },
    en: { subject: "{{company}}: about your request {{number}}", body: "Hello {{name}},\nThank you for trusting us. After reviewing your request {{number}} we are not able to take it on at the moment.\nWe would be happy to help later; you can book a consultation to assess readiness or update the property details at any time." },
  },
  portal_link: {
    ar: { subject: "{{company}}: رابط حسابك", body: "مرحبا {{name}}،\nهذا رابط حسابك لمتابعة طلباتك وفواتيرك والدفع واعتماد التسليمات (صالح 30 يوما):\n{{link}}" },
    en: { subject: "{{company}}: your account link", body: "Hello {{name}},\nHere is your account link to follow your requests and invoices, pay online and approve deliveries (valid 30 days):\n{{link}}" },
  },
};

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const fillTemplate = (text: string, vars: Record<string, string>) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");

export async function getTemplate(key: TemplateKey, lang: "ar" | "en") {
  const [row] = await db.select().from(messageTemplates).where(and(eq(messageTemplates.key, key), eq(messageTemplates.language, lang)))
    .orderBy(desc(messageTemplates.updatedAt)).limit(1);
  return row ? { subject: row.subject, body: row.body } : DEFAULT_TEMPLATES[key][lang];
}

async function companyName(lang: "ar" | "en") {
  const [row] = await db.select().from(settings).where(eq(settings.key, lang === "ar" ? "companyNameAr" : "companyNameEn"));
  return String(row?.value ?? (lang === "ar" ? "عقار 360" : "Aqar 360"));
}

/** Latest permission for a purpose on a channel ("all" rows count for every channel). */
export async function hasConsent(contactId: number, purpose: "request_updates" | "match_alerts" | "marketing", channel: string) {
  const [row] = await db.select({ granted: consents.granted }).from(consents).where(and(eq(consents.contactId, contactId),
    eq(consents.purpose, purpose), inArray(consents.channel, [channel, "all"]))).orderBy(desc(consents.createdAt), desc(consents.id)).limit(1);
  return !!row?.granted;
}

async function deliver(to: string, subject: string, body: string) {
  const resend = await integrationConfig("resend");
  if (!resend) return { status: "skipped" as const, reason: "no_provider" };
  const { apiKey: key, from } = resend;
  const html = `<div dir="auto" style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(body).replace(/\n/g, "<br>")}</div>`;
  const res = await fetch("https://api.resend.com/emails", { method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text: body }) });
  return res.ok ? { status: "sent" as const, reason: null } : { status: "failed" as const, reason: `provider_${res.status}` };
}

/** Queue-and-send one message. The same key never sends twice; missing consent or address is recorded, not an error. */
type SendOpts = { key: string; template: TemplateKey; contactId: number; requestId?: number | null;
  purpose: "request_updates" | "match_alerts" | "transactional"; vars: Record<string, string> };

/** One customer message on every channel the customer agreed to: email always, WhatsApp when set up (strategy §8.2). */
export async function sendMessage(opts: SendOpts) {
  await Promise.all([sendEmail(opts), sendWhatsApp(opts).catch((e) => console.error("whatsapp send failed:", (e as Error).message))]);
}

async function sendEmail(opts: SendOpts) {
  const [existing] = await db.select({ id: outbox.id }).from(outbox).where(eq(outbox.key, opts.key));
  if (existing) return;
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, opts.contactId));
  if (!contact) return;
  const lang = contact.language === "en" ? "en" : "ar";
  const template = await getTemplate(opts.template, lang);
  const vars = { company: await companyName(lang), name: contact.name, ...opts.vars };
  const subject = fillTemplate(template.subject, vars);
  const body = fillTemplate(template.body, vars);
  const base = { key: opts.key, templateKey: opts.template, recipient: contact.email, subject, body, contactId: contact.id,
    requestId: opts.requestId ?? null };
  if (!contact.email) return void (await db.insert(outbox).values({ ...base, status: "skipped", reason: "no_email" }).onConflictDoNothing());
  // Messages about a service the customer bought (job details, delivery, receipts) are not marketing: no opt-in needed.
  if (opts.purpose !== "transactional" && !(await hasConsent(contact.id, opts.purpose, "email"))) {
    return void (await db.insert(outbox).values({ ...base, status: "skipped", reason: "no_consent" }).onConflictDoNothing());
  }
  const [claimed] = await db.insert(outbox).values({ ...base, status: "skipped", reason: "sending" }).onConflictDoNothing().returning();
  if (!claimed) return;
  const result = await deliver(contact.email, subject, body).catch(() => ({ status: "failed" as const, reason: "network" }));
  await db.update(outbox).set({ status: result.status, reason: result.reason }).where(eq(outbox.id, claimed.id));
}

export const myRequestLink = (lang: "ar" | "en", token: string) => `${siteUrl}/${lang}/my-request?token=${encodeURIComponent(token)}`;

export async function afterRequestReceived(requestId: number, token?: string) {
  const [r] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!r) return;
  await sendMessage({ key: `received:${r.id}`, template: "received", contactId: r.contactId, requestId: r.id, purpose: "request_updates",
    vars: { number: r.number, link: token ? myRequestLink(r.language, token) : siteUrl } });
}

// ---- Daily reminders (Vercel Cron → /api/cron/daily) ----------------------------------------------------------
export async function runDailyReminders(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const week = `${now.getUTCFullYear()}-${Math.ceil((now.getUTCDate() + 6 - now.getUTCDay()) / 7)}-${now.getUTCMonth()}`;
  const counts = { viewing: 0, expiring: 0, stillSearching: 0, payment: 0 };
  // Viewings in the next 24 hours.
  const soon = await db.select({ a: activities, r: requests }).from(activities).leftJoin(requests, eq(activities.requestId, requests.id))
    .where(and(eq(activities.type, "viewing"), eq(activities.done, false), gte(activities.dueAt, now),
      lte(activities.dueAt, new Date(now.getTime() + 24 * 3_600_000))));
  for (const { a } of soon) {
    const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Muscat" }).format(a.dueAt!);
    await sendMessage({ key: `viewing:${a.id}:${a.dueAt!.toISOString()}`, template: "viewing_reminder", contactId: a.contactId,
      requestId: a.requestId, purpose: "request_updates", vars: { when } });
    counts.viewing++;
  }
  // Requests expiring within 7 days, and quiet searches (no activity for the follow-up days in Settings).
  const open = await db.select().from(requests).where(and(inArray(requests.status, [...OPEN_STATUSES]), eq(requests.kind, "search")));
  const [setting] = await db.select().from(settings).where(eq(settings.key, "followUpDays"));
  const followUpDays = Number(setting?.value) || 14;
  for (const r of open) {
    if (r.expiresOn && new Date(r.expiresOn).getTime() - now.getTime() < 7 * 86_400_000) {
      await sendMessage({ key: `expiring:${r.id}:${r.expiresOn}`, template: "request_expiring", contactId: r.contactId, requestId: r.id,
        purpose: "request_updates", vars: { number: r.number, date: String(r.expiresOn), link: `${siteUrl}/${r.language}/find-me-a-property` } });
      counts.expiring++;
    }
    const [last] = await db.select({ at: activities.createdAt }).from(activities).where(eq(activities.requestId, r.id))
      .orderBy(desc(activities.createdAt)).limit(1);
    if (!r.alertsPaused && (!last || now.getTime() - last.at.getTime() > followUpDays * 86_400_000)) {
      await sendMessage({ key: `still:${r.id}:${week}`, template: "still_searching", contactId: r.contactId, requestId: r.id,
        purpose: "request_updates", vars: { number: r.number, link: `${siteUrl}/${r.language}/find-me-a-property` } });
      counts.stillSearching++;
    }
  }
  // Overdue invoices, at most once a week each.
  const overdue = await db.select().from(invoices).where(and(eq(invoices.kind, "invoice"), inArray(invoices.status, ["sent", "partly_paid"]),
    lt(invoices.dueDate, day)));
  for (const inv of overdue) {
    await sendMessage({ key: `payment:${inv.id}:${week}`, template: "payment_reminder", contactId: inv.contactId, requestId: inv.requestId,
      purpose: "request_updates", vars: { number: inv.number, amount: `${inv.total.toFixed(3)} OMR`, date: String(inv.dueDate), link: docLink(inv.id) } });
    counts.payment++;
  }
  return counts;
}

export async function propertyLabel(propertyId: number | null) {
  if (!propertyId) return "";
  const [p] = await db.select().from(properties).where(eq(properties.id, propertyId));
  return p ? `${p.kind}${p.unitNumber ? ` ${p.unitNumber}` : ""} (${p.code})` : "";
}


/**
 * WhatsApp copy of the same message through the approved template (business-initiated messages must use templates).
 * Needs WhatsApp consent even for service messages; nothing is logged while WhatsApp is not connected.
 */
async function sendWhatsApp(opts: SendOpts) {
  const { waReady, sendTemplate, recordOut } = await import("./whatsapp");
  if (!(await waReady())) return;
  const key = `${opts.key}:wa`;
  const [existing] = await db.select({ id: outbox.id }).from(outbox).where(eq(outbox.key, key));
  if (existing) return;
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, opts.contactId));
  if (!contact?.phone) return;
  const purpose = opts.purpose === "transactional" ? "request_updates" : opts.purpose;
  const lang = contact.language === "en" ? "en" : "ar";
  const vars = { company: await companyName(lang), name: contact.name, ...opts.vars };
  const template = await getTemplate(opts.template, lang);
  const base = { key, templateKey: opts.template, channel: "whatsapp", recipient: contact.phone, subject: fillTemplate(template.subject, vars),
    body: fillTemplate(template.body, vars), contactId: contact.id, requestId: opts.requestId ?? null };
  if (!(await hasConsent(contact.id, purpose, "whatsapp"))) {
    return void (await db.insert(outbox).values({ ...base, status: "skipped", reason: "no_consent" }).onConflictDoNothing());
  }
  const [claimed] = await db.insert(outbox).values({ ...base, status: "skipped", reason: "sending" }).onConflictDoNothing().returning();
  if (!claimed) return;
  const result = await sendTemplate(contact.phone, opts.template, lang, vars);
  if (!result.ok && result.error === "no_template") {
    return void (await db.update(outbox).set({ reason: "no_template" }).where(eq(outbox.id, claimed.id)));
  }
  await db.update(outbox).set({ status: result.ok ? "sent" : "failed", reason: result.ok ? null : result.error, providerId: result.ok ? result.id : null })
    .where(eq(outbox.id, claimed.id));
  await recordOut(contact.id, contact.phone, base.body, result);
}
