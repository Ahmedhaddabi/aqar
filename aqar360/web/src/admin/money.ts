// Money queries: invoices with paid amounts, finance summary for a period.
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { areas, contacts, expenses, invoices, payments, properties, requests, services, settings } from "@/db/schema";

export type InvoiceTab = "invoice" | "quote" | "unpaid";

const paidSum = sql<number>`coalesce((select sum(${payments.amount}) from ${payments} where ${payments.invoiceId} = ${invoices.id}), 0)::float`;

export async function listInvoices(tab: InvoiceTab) {
  const where = tab === "quote" ? eq(invoices.kind, "quote")
    : tab === "unpaid" ? and(eq(invoices.kind, "invoice"), inArray(invoices.status, ["sent", "partly_paid"])) : eq(invoices.kind, "invoice");
  return db.select({ invoice: invoices, customer: contacts.name, paid: paidSum }).from(invoices)
    .innerJoin(contacts, eq(invoices.contactId, contacts.id)).where(where).orderBy(desc(invoices.createdAt)).limit(200);
}

export async function getInvoice(id: number) {
  const [row] = await db.select({ invoice: invoices, contact: contacts, paid: paidSum }).from(invoices)
    .innerJoin(contacts, eq(invoices.contactId, contacts.id)).where(eq(invoices.id, id));
  if (!row) return null;
  return { ...row, payments: await db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(asc(payments.paidOn)) };
}

export async function serviceChoices() {
  return db.select().from(services).orderBy(asc(services.sort));
}

export async function companyDetails() {
  const rows = await db.select().from(settings);
  const get = (key: string) => String(rows.find((r) => r.key === key)?.value ?? "");
  return { nameAr: get("companyNameAr") || "عقار 360", nameEn: get("companyNameEn") || "Aqar 360", address: get("companyAddress"),
    phone: get("companyPhone"), email: get("companyEmail"), cr: get("companyCr"), vat: get("companyVat") };
}

/** Income counts only our share of each payment: client media money passes through and is shown separately. */
export async function financeSummary(from: string, to: string) {
  const paid = await db.select({ amount: payments.amount, method: payments.method, total: invoices.total, media: invoices.passThroughTotal,
    vat: invoices.vatTotal })
    .from(payments).innerJoin(invoices, eq(payments.invoiceId, invoices.id)).where(and(gte(payments.paidOn, from), lte(payments.paidOn, to)));
  // VAT collected belongs to the tax authority: like client media money it is received but is not income.
  let income = 0;
  let media = 0;
  let vat = 0;
  for (const p of paid) {
    const mediaShare = p.total ? (p.media ?? 0) / p.total : 0;
    const vatShare = p.total ? (p.vat ?? 0) / p.total : 0;
    media += p.amount * mediaShare;
    vat += p.amount * vatShare;
    income += p.amount * (1 - mediaShare - vatShare);
  }
  const spent = await db.select().from(expenses).where(and(gte(expenses.spentOn, from), lte(expenses.spentOn, to)));
  const byCategory: Record<string, number> = {};
  for (const e of spent) byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
  const totalSpent = spent.reduce((a, e) => a + e.amount, 0);
  const petty = spent.filter((e) => e.paidFrom === "petty_cash").reduce((a, e) => a + e.amount, 0);
  const [owed] = await db.select({ n: sql<number>`coalesce(sum(${invoices.total} - ${paidSum}), 0)::float` }).from(invoices)
    .where(and(eq(invoices.kind, "invoice"), inArray(invoices.status, ["sent", "partly_paid"])));
  return { income, media, vat, spent: totalSpent, petty, profit: income - totalSpent, receivable: owed.n, byCategory };
}

/** Income (our share, as in financeSummary) and spending per month, for the last `months` months up to `endMonth` (YYYY-MM). */
export async function monthlyMoney(endMonth: string, months = 12) {
  const [y, m] = endMonth.split("-").map(Number);
  const keys = Array.from({ length: months }, (_, i) => new Date(Date.UTC(y, m - 1 - (months - 1 - i), 1)).toISOString().slice(0, 7));
  const from = `${keys[0]}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const [paid, spent] = await Promise.all([
    db.select({ on: payments.paidOn, amount: payments.amount, total: invoices.total, media: invoices.passThroughTotal, vat: invoices.vatTotal })
      .from(payments).innerJoin(invoices, eq(payments.invoiceId, invoices.id)).where(and(gte(payments.paidOn, from), lte(payments.paidOn, to))),
    db.select({ on: expenses.spentOn, amount: expenses.amount }).from(expenses).where(and(gte(expenses.spentOn, from), lte(expenses.spentOn, to))),
  ]);
  const rows = new Map(keys.map((k) => [k, { month: k, income: 0, spent: 0 }]));
  for (const p of paid) {
    const row = rows.get(String(p.on).slice(0, 7));
    if (row) row.income += p.amount * (1 - (p.total ? ((p.media ?? 0) + (p.vat ?? 0)) / p.total : 0));
  }
  for (const e of spent) {
    const row = rows.get(String(e.on).slice(0, 7));
    if (row) row.spent += e.amount;
  }
  return [...rows.values()];
}

export async function listExpenses(from: string, to: string) {
  return db.select().from(expenses).where(and(gte(expenses.spentOn, from), lte(expenses.spentOn, to))).orderBy(desc(expenses.spentOn), desc(expenses.id));
}

/** What customers owe, grouped by how late it is (strategy §25.1: AR aging). */
export async function arAging(today: string) {
  const rows = await db.select({ due: invoices.dueDate, issued: invoices.issueDate, total: invoices.total, paid: paidSum }).from(invoices)
    .where(and(eq(invoices.kind, "invoice"), inArray(invoices.status, ["sent", "partly_paid"])));
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  for (const r of rows) {
    const late = Math.floor((Date.parse(today) - Date.parse(r.due ?? r.issued)) / 86_400_000);
    const key = late <= 0 ? "current" : late <= 30 ? "d30" : late <= 60 ? "d60" : late <= 90 ? "d90" : "d90p";
    buckets[key] += r.total - r.paid;
  }
  return buckets;
}

/** What an invoice is for, printed under "Bill to": the property (type, area, code) and the request number, when linked. */
export async function invoiceAbout(inv: { propertyId: number | null; requestId: number | null }) {
  const [p] = inv.propertyId ? await db.select({ p: properties, a: areas }).from(properties).leftJoin(areas, eq(properties.areaId, areas.id))
    .where(eq(properties.id, inv.propertyId)) : [];
  const [r] = inv.requestId ? await db.select({ number: requests.number }).from(requests).where(eq(requests.id, inv.requestId)) : [];
  if (!p && !r) return null;
  return { property: p ? { en: [p.p.kind, p.a?.nameEn].filter(Boolean).join(", "), ar: p.a?.nameAr ?? "", code: p.p.code } : null, request: r?.number ?? null };
}
