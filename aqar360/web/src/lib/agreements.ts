// Agreements signed online (strategy §26.3 owner mandate / reservation). Staff start from a template, edit the text,
// and send a private link; the text is fixed with a SHA-256 hash when sent, and the customer signs by typing their
// name and drawing a signature. Name, time, device and a hash of the IP are kept with the signature.
// The starting texts are drafts for the customer's lawyer to review (docs/customer_inputs.md).
import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { companyDetails } from "@/admin/money";
import { db } from "@/db";
import { agreements, areas, contacts, properties, requests } from "@/db/schema";

import { audit } from "./auth";
import { agreementLink } from "./doc-link";
import { sendMessage } from "./messages";
import { notify } from "./notify";

export const AGREEMENT_TEMPLATES = {
  marketing_exclusive: {
    title: "Exclusive marketing agreement · اتفاقية تسويق حصرية",
    body: `This agreement is between {{company}} (CR {{companyCr}}) and {{name}} (ID {{idNumber}}), the owner of {{property}}.
1. The owner appoints {{company}} as the only marketer of the property for {{months}} months from {{date}}.
2. Asking price: {{price}} OMR. The owner tells us before changing the price or selling or letting through anyone else.
3. Our fee: {{commission}}, due only when a deal we introduce is completed.
4. We may photograph the property and publish it on our website and channels; the exact address is not published without the owner's consent.
5. Either side may end this agreement with 14 days' written notice.

هذه الاتفاقية بين {{company}} (سجل تجاري {{companyCr}}) و{{name}} (رقم الهوية {{idNumber}})، مالك {{property}}.
1. يعيّن المالك {{company}} مسوّقا حصريا للعقار لمدة {{months}} أشهر تبدأ من {{date}}.
2. السعر المطلوب: {{price}} ر.ع. يُبلغنا المالك قبل تغيير السعر أو البيع أو التأجير عن طريق أي جهة أخرى.
3. أتعابنا: {{commission}}، وتستحق فقط عند إتمام صفقة قدّمناها.
4. يجوز لنا تصوير العقار ونشره في موقعنا وقنواتنا، ولا يُنشر العنوان الدقيق دون موافقة المالك.
5. يجوز لأي طرف إنهاء هذه الاتفاقية بإشعار كتابي مدته 14 يوما.`,
  },
  marketing_open: {
    title: "Marketing agreement · اتفاقية تسويق",
    body: `This agreement is between {{company}} (CR {{companyCr}}) and {{name}} (ID {{idNumber}}), the owner of {{property}}.
1. The owner allows {{company}} to market the property from {{date}}; the owner may also market it elsewhere.
2. Asking price: {{price}} OMR.
3. Our fee: {{commission}}, due only when a buyer or tenant we introduced completes a deal.
4. We may photograph the property and publish it on our website and channels; the exact address is not published without the owner's consent.

هذه الاتفاقية بين {{company}} (سجل تجاري {{companyCr}}) و{{name}} (رقم الهوية {{idNumber}})، مالك {{property}}.
1. يسمح المالك لـ{{company}} بتسويق العقار ابتداء من {{date}}، ويجوز للمالك تسويقه لدى جهات أخرى.
2. السعر المطلوب: {{price}} ر.ع.
3. أتعابنا: {{commission}}، وتستحق فقط عند إتمام صفقة مع مشترٍ أو مستأجر قدّمناه.
4. يجوز لنا تصوير العقار ونشره في موقعنا وقنواتنا، ولا يُنشر العنوان الدقيق دون موافقة المالك.`,
  },
  reservation: {
    title: "Reservation form · نموذج حجز",
    body: `{{name}} (ID {{idNumber}}) asks {{company}} to reserve {{property}} at {{price}} OMR from {{date}}.
1. The reservation holds the property for 7 days while the contract is prepared.
2. Any reservation deposit and its refund terms are as stated on the receipt.
3. The final terms are those of the sale or tenancy contract signed by both parties.

يطلب {{name}} (رقم الهوية {{idNumber}}) من {{company}} حجز {{property}} بسعر {{price}} ر.ع ابتداء من {{date}}.
1. يُحفظ العقار لمدة 7 أيام لحين إعداد العقد.
2. أي مبلغ حجز وشروط استرداده كما هو مذكور في الإيصال.
3. الشروط النهائية هي شروط عقد البيع أو الإيجار الموقّع من الطرفين.`,
  },
  blank: { title: "Agreement · اتفاقية", body: "" },
} as const;
export type AgreementTemplate = keyof typeof AGREEMENT_TEMPLATES;

const fillVars = (text: string, vars: Record<string, string>) => text.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
export const textHash = (title: string, body: string) => createHash("sha256").update(`${title}\n${body}`).digest("hex");

export async function createAgreement(opts: { contactId: number; requestId?: number | null; propertyId?: number | null; template: AgreementTemplate; userId: number }) {
  const [c] = await db.select().from(contacts).where(eq(contacts.id, opts.contactId));
  if (!c) return null;
  const [r] = opts.requestId ? await db.select().from(requests).where(and(eq(requests.id, opts.requestId), eq(requests.contactId, c.id))) : [];
  const review = (r?.details as { review?: { propertyId?: number } } | undefined)?.review;
  const propertyId = opts.propertyId ?? r?.interestPropertyId ?? review?.propertyId ?? null;
  const [p] = propertyId ? await db.select({ p: properties, a: areas }).from(properties).leftJoin(areas, eq(properties.areaId, areas.id))
    .where(eq(properties.id, propertyId)) : [];
  const company = await companyDetails();
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  const price = p ? (p.p.purpose === "rent" ? p.p.rentPrice : p.p.salePrice ?? p.p.rentPrice) : r?.budgetMax;
  const vars = { name: c.name, idNumber: c.idNumber || "____", company: company.nameEn, companyCr: company.cr || "____", date: today,
    property: p ? `${p.p.kind} ${p.p.code}${p.a ? `, ${p.a.nameEn} / ${p.a.nameAr}` : ""}` : "____", price: price ? String(price) : "____",
    commission: "____", months: "3" };
  const t = AGREEMENT_TEMPLATES[opts.template];
  const [row] = await db.insert(agreements).values({
    number: sql`'AGR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('agreement_number_seq')::text, 5, '0')`,
    contactId: c.id, requestId: r?.id ?? null, propertyId: p?.p.id ?? null, template: opts.template, title: t.title,
    body: fillVars(t.body, vars), createdBy: opts.userId,
  }).returning();
  await audit("agreement_created", "agreement", row.id, { template: opts.template }, opts.userId);
  return row;
}

/** Fixes the text (hash) and sends the private link; a sent agreement can no longer be edited. */
export async function sendAgreement(id: number, userId: number) {
  const [a] = await db.select().from(agreements).where(eq(agreements.id, id));
  if (!a || !["draft", "sent"].includes(a.status) || !a.body.trim()) return false;
  const bodyHash = textHash(a.title, a.body);
  await db.update(agreements).set({ status: "sent", bodyHash, sentAt: a.sentAt ?? new Date(), updatedAt: new Date() }).where(eq(agreements.id, id));
  await sendMessage({ key: `agreement:${id}:${bodyHash.slice(0, 12)}:${Date.now().toString(36)}`, template: "agreement_sent", contactId: a.contactId,
    requestId: a.requestId, purpose: "transactional", vars: { title: a.title, number: a.number, link: agreementLink(id) } });
  await audit("agreement_sent", "agreement", id, { bodyHash }, userId);
  return true;
}

export type SignInput = { name: string; signature: string; ipHash: string | null; agent: string };

/** Signs only an agreement that is still waiting and whose text is exactly what was sent. */
export async function signAgreement(id: number, input: SignInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 120) return { ok: false as const, reason: "name" };
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.signature) || input.signature.length > 400_000 || input.signature.length < 500) {
    return { ok: false as const, reason: "signature" };
  }
  const [a] = await db.select().from(agreements).where(eq(agreements.id, id));
  if (!a || a.status !== "sent" || a.bodyHash !== textHash(a.title, a.body)) return { ok: false as const, reason: "state" };
  const [done] = await db.update(agreements).set({ status: "signed", signedAt: new Date(), signerName: name, signature: input.signature,
    signerIpHash: input.ipHash, signerAgent: input.agent.slice(0, 300), updatedAt: new Date() })
    .where(and(eq(agreements.id, id), eq(agreements.status, "sent"), eq(agreements.bodyHash, a.bodyHash!))).returning();
  if (!done) return { ok: false as const, reason: "state" };
  await tellStaff(done, "agreement_signed");
  await audit("agreement_signed", "agreement", id, { bodyHash: done.bodyHash, signer: name });
  return { ok: true as const };
}

export async function declineAgreement(id: number, reason: string) {
  const [done] = await db.update(agreements).set({ status: "declined", declineReason: reason.trim().slice(0, 1000) || null, updatedAt: new Date() })
    .where(and(eq(agreements.id, id), eq(agreements.status, "sent"))).returning();
  if (!done) return false;
  await tellStaff(done, "agreement_declined");
  await audit("agreement_declined", "agreement", id, {});
  return true;
}

async function tellStaff(a: typeof agreements.$inferSelect, kind: "agreement_signed" | "agreement_declined") {
  const [r] = a.requestId ? await db.select({ assignedTo: requests.assignedTo }).from(requests).where(eq(requests.id, a.requestId)) : [];
  await notify({ userIds: [a.createdBy, r?.assignedTo] }, { kind, title: `${a.number} · ${a.title}`, href: `/admin/agreements/${a.id}`, key: `${kind}:${a.id}` });
}

export async function agreementsFor(where: { contactId?: number; requestId?: number }) {
  return db.select().from(agreements).where(where.requestId ? eq(agreements.requestId, where.requestId) : eq(agreements.contactId, where.contactId ?? 0))
    .orderBy(sql`${agreements.createdAt} desc`);
}
