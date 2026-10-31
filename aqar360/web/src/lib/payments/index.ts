// Online payment of invoices: start a checkout, then record the payment exactly once (return page, webhook or both).
import { randomBytes } from "node:crypto";

import { and, desc, eq, gt, inArray } from "drizzle-orm";

import { db } from "@/db";
import { contacts, invoices, onlinePayments, type PaymentProvider, payments, settings } from "@/db/schema";
import { audit } from "@/lib/auth";
import { siteUrl } from "@/lib/config";
import { paidSoFar, recalcInvoice } from "@/lib/invoices";
import { notify } from "@/lib/notify";

import { createPaymobIntention, paymobConfig, paymobReady } from "./paymob";
import { createThawaniSession, thawaniConfig, thawaniReady } from "./thawani";

/** Gateways the customer can use: keys present on the server and not switched off in Admin → Settings. */
export async function enabledGateways(): Promise<PaymentProvider[]> {
  const rows = await db.select().from(settings).where(inArray(settings.key, ["payThawani", "payPaymob"]));
  const off = (key: string) => rows.find((r) => r.key === key)?.value === false;
  return [...(thawaniReady() && !off("payThawani") ? ["thawani" as const] : []), ...(paymobReady() && !off("payPaymob") ? ["paymob" as const] : [])];
}

export const gatewayStatus = () => ({
  thawani: { ready: thawaniReady(), live: thawaniConfig().live, webhook: !!thawaniConfig().webhookSecret },
  paymob: { ready: paymobReady(), live: paymobConfig().live, factor: paymobConfig().factor },
});

export type StartResult = { ok: true; url: string } | { ok: false; reason: "not_payable" | "unavailable" | "provider_error" };

/** Creates (or reuses for 30 minutes) a checkout for the invoice's remaining balance. */
export async function startPayment(invoiceId: number, provider: PaymentProvider, docUrl: string): Promise<StartResult> {
  if (!(await enabledGateways()).includes(provider)) return { ok: false, reason: "unavailable" };
  const [row] = await db.select({ inv: invoices, contact: contacts }).from(invoices).innerJoin(contacts, eq(invoices.contactId, contacts.id))
    .where(eq(invoices.id, invoiceId));
  if (!row || row.inv.kind !== "invoice" || !["sent", "partly_paid"].includes(row.inv.status)) return { ok: false, reason: "not_payable" };
  const balance = Math.round((row.inv.total - (await paidSoFar(invoiceId))) * 1000) / 1000;
  if (balance < 0.1) return { ok: false, reason: "not_payable" }; // Thawani's minimum is 100 baisa

  const [recent] = await db.select().from(onlinePayments).where(and(eq(onlinePayments.invoiceId, invoiceId), eq(onlinePayments.provider, provider),
    eq(onlinePayments.status, "pending"), eq(onlinePayments.amount, balance), gt(onlinePayments.createdAt, new Date(Date.now() - 30 * 60_000))))
    .orderBy(desc(onlinePayments.createdAt)).limit(1);
  if (recent?.checkoutUrl) return { ok: true, url: recent.checkoutUrl };

  const reference = `${row.inv.number}-${randomBytes(4).toString("hex")}`;
  const title = `${row.inv.number} Aqar 360`;
  const back = (state: string) => `${siteUrl}/api/pay/return/${provider}?ref=${encodeURIComponent(reference)}&state=${state}`;
  const live = provider === "thawani" ? thawaniConfig().live : paymobConfig().live;
  const [attempt] = await db.insert(onlinePayments).values({ invoiceId, provider, reference, amount: balance, live }).returning();
  try {
    const started = provider === "thawani"
      ? await createThawaniSession({ reference, title, amountBaisa: Math.round(balance * 1000), successUrl: back("done"), cancelUrl: back("cancel"),
        metadata: { invoice: row.inv.number, doc: docUrl } }).then((s) => ({ ref: s.sessionId, url: s.url }))
      : await createPaymobIntention({ reference, title, amount: balance, customer: { name: row.contact.name, phone: row.contact.phone, email: row.contact.email },
        notificationUrl: `${siteUrl}/api/webhooks/paymob`, redirectionUrl: `${siteUrl}/api/pay/return/paymob`, extras: { invoice: row.inv.number } })
        .then((s) => ({ ref: s.intentionId, url: s.url }));
    await db.update(onlinePayments).set({ providerRef: started.ref, checkoutUrl: started.url }).where(eq(onlinePayments.id, attempt.id));
    await audit("online_payment_started", "invoice", invoiceId, { provider, amount: balance });
    return { ok: true, url: started.url };
  } catch (error) {
    console.error(`${provider} checkout failed:`, (error as Error).message);
    await db.update(onlinePayments).set({ status: "failed", raw: { error: (error as Error).message.slice(0, 500) } }).where(eq(onlinePayments.id, attempt.id));
    return { ok: false, reason: "provider_error" };
  }
}

/** Idempotent: only the first confirmation for an attempt records the payment and updates the invoice. */
export async function markPaid(reference: string, details: { transactionId: string; amount: number; raw: Record<string, unknown> }) {
  const [attempt] = await db.select().from(onlinePayments).where(eq(onlinePayments.reference, reference));
  if (!attempt) return { ok: false as const, reason: "unknown" };
  if (Math.abs(details.amount - attempt.amount) > 0.0005) {
    await audit("online_payment_amount_mismatch", "invoice", attempt.invoiceId, { reference, expected: attempt.amount, got: details.amount });
    return { ok: false as const, reason: "amount" };
  }
  const [won] = await db.update(onlinePayments).set({ status: "paid", paidAt: new Date(), transactionId: details.transactionId, raw: details.raw })
    .where(and(eq(onlinePayments.id, attempt.id), inArray(onlinePayments.status, ["pending", "cancelled", "failed"]))).returning();
  if (won) {
    await db.insert(payments).values({ invoiceId: attempt.invoiceId, amount: attempt.amount, method: "online",
      reference: `${attempt.provider === "thawani" ? "Thawani" : "Paymob"} ${details.transactionId}`.trim(),
      paidOn: new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10) });
    await recalcInvoice(attempt.invoiceId);
    await audit("online_payment_paid", "invoice", attempt.invoiceId, { provider: attempt.provider, amount: attempt.amount, reference });
    await notify({ app: "erp" }, { kind: "payment_online", title: `${attempt.amount.toFixed(3)} OMR · ${reference}`,
      href: `/admin/invoices/${attempt.invoiceId}`, key: `payment_online:${attempt.id}` });
  }
  return { ok: true as const, invoiceId: attempt.invoiceId };
}

export async function markFailed(reference: string, status: "failed" | "cancelled", raw: Record<string, unknown> = {}) {
  await db.update(onlinePayments).set({ status, raw }).where(and(eq(onlinePayments.reference, reference), eq(onlinePayments.status, "pending")));
}

export async function attemptByReference(reference: string) {
  const [row] = await db.select().from(onlinePayments).where(eq(onlinePayments.reference, reference));
  return row ?? null;
}
