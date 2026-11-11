"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { contacts, EXPENSE_CATEGORIES, expenses, invoices, PAYMENT_METHODS, payments, properties } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { docLink } from "@/lib/doc-link";
import { normalizePhone } from "@/lib/intake";
import { invoiceDesign } from "@/lib/invoice-design";
import { invoiceTotals } from "@/lib/invoice-math";
import { recalcInvoice } from "@/lib/invoices";
import { sendMessage } from "@/lib/messages";
import { uploadImage } from "@/lib/storage";

const STAFF = ["admin", "manager"] as const;
const id = z.coerce.number().int().positive();
const today = () => new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10); // Oman date

const line = z.object({ description: z.string().trim().min(1).max(300), qty: z.coerce.number().positive().max(10_000),
  unitPrice: z.coerce.number().min(0).max(10_000_000), serviceCode: z.string().max(40).nullish(), passThrough: z.boolean().optional() });

const invoiceForm = z.object({ kind: z.enum(["quote", "invoice"]), contactId: id, requestId: id.optional(),
  propertyCode: z.string().trim().max(40).optional(), customerAddress: z.string().trim().max(300).optional(), customerVat: z.string().trim().max(40).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), notes: z.string().max(2000).default(""),
  discount: z.coerce.number().min(0).max(10_000_000).default(0), chargeVat: z.literal("on").optional(),
  vatRate: z.coerce.number().min(0).max(100).default(0),
  lines: z.preprocess((v) => JSON.parse(String(v || "[]")), z.array(line).min(1).max(50)) });

const parseInvoiceForm = (form: FormData) => invoiceForm.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));

/** Totals from the lines, discount and VAT; the VAT rate is fixed on the invoice so later setting changes never alter it. */
/** The property code typed on the form → its id (unknown codes are refused), and the bill-to details saved on the customer. */
async function billDetails(data: z.infer<typeof invoiceForm>) {
  // Saved first, so a wrong property code does not lose the address typed on the form.
  await db.update(contacts).set({ address: data.customerAddress ?? "", vatNumber: data.customerVat ?? "", updatedAt: new Date() })
    .where(eq(contacts.id, data.contactId));
  if (!data.propertyCode) return { propertyId: null };
  const [p] = await db.select({ id: properties.id }).from(properties).where(sql`upper(${properties.code}) = upper(${data.propertyCode})`);
  return p ? { propertyId: p.id } : null;
}

function priced(data: z.infer<typeof invoiceForm>) {
  const vatRate = data.chargeVat ? data.vatRate : 0;
  const t = invoiceTotals(data.lines, data.discount, vatRate);
  return { lines: data.lines, subtotal: t.subtotal, discount: t.discount, vatRate, vatTotal: t.vatTotal, total: t.total, passThroughTotal: t.media };
}

const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

/** "New customer" on the new quote/invoice page: name and phone, then straight on to the bill (an existing phone reuses that customer). */
export async function newBillCustomer(form: FormData) {
  const user = await requireUser([...STAFF]);
  const kind = form.get("kind") === "quote" ? "quote" : "invoice";
  const copy = id.safeParse(form.get("copy"));
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const rawPhone = String(form.get("phone") ?? "").trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  const back = `/admin/invoices/new?kind=${kind}${copy.success ? `&copy=${copy.data}` : ""}`;
  if (!name || (rawPhone && !phone)) redirect(`${back}&error=customer`);
  const [same] = phone ? await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.phone, phone)).limit(1) : [];
  let contactId = same?.id;
  if (!contactId) {
    const [created] = await db.insert(contacts).values({ name, phone, source: "Invoice" }).returning({ id: contacts.id });
    contactId = created.id;
    await audit("contact_created", "contact", contactId, { via: "invoice" }, user.id);
  }
  redirect(`${back}&contact=${contactId}`);
}

export async function createInvoice(form: FormData) {
  const user = await requireUser([...STAFF]);
  const parsed = parseInvoiceForm(form);
  if (!parsed.success) {
    // Back to the same form (customer kept) with a message, instead of the invoice list.
    const kind = form.get("kind") === "quote" ? "quote" : "invoice";
    const req = form.get("requestId") ? `&request=${encodeURIComponent(String(form.get("requestId")))}` : "";
    redirect(`/admin/invoices/new?kind=${kind}&contact=${encodeURIComponent(String(form.get("contactId") ?? ""))}${req}&error=invalid`);
  }
  const { kind, lines: _lines, discount: _d, chargeVat: _c, vatRate: _v, propertyCode: _p, customerAddress: _a, customerVat: _t, ...rest } = parsed.data;
  const bill = await billDetails(parsed.data);
  if (!bill) redirect(`/admin/invoices/new?kind=${kind}&contact=${parsed.data.contactId}${rest.requestId ? `&request=${rest.requestId}` : ""}&error=property`);
  const money = priced(parsed.data);
  const design = await invoiceDesign();
  const issueDate = today();
  const prefix = kind === "quote" ? "QUO" : "INV";
  const seq = kind === "quote" ? "quote_number_seq" : "invoice_number_seq";
  const [created] = await db.insert(invoices).values({ kind, ...rest, ...money, requestId: rest.requestId ?? null, propertyId: bill.propertyId,
    number: sql`${prefix} || '-' || to_char(now(), 'YYYY') || '-' || lpad(nextval(${seq})::text, 5, '0')`,
    issueDate, dueDate: rest.dueDate ?? (kind === "invoice" ? addDays(issueDate, design.dueDays) : null), createdBy: user.id }).returning({ id: invoices.id });
  await audit(`${kind}_created`, "invoice", created.id, { total: money.total }, user.id);
  redirect(`/admin/invoices/${created.id}`);
}

/** Drafts can still be changed: lines, discount, VAT, due date and notes. Once sent, cancel and make a new one. */
export async function updateInvoice(form: FormData) {
  const user = await requireUser([...STAFF]);
  const invoiceId = id.safeParse(form.get("id"));
  if (!invoiceId.success) redirect("/admin/invoices");
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId.data));
  if (!inv || inv.status !== "draft") redirect(`/admin/invoices/${invoiceId.data}`);
  const parsed = parseInvoiceForm(form);
  if (!parsed.success) redirect(`/admin/invoices/new?edit=${inv.id}&error=invalid`);
  const bill = await billDetails({ ...parsed.data, contactId: inv.contactId });
  if (!bill) redirect(`/admin/invoices/new?edit=${inv.id}&error=property`);
  const money = priced(parsed.data);
  await db.update(invoices).set({ ...money, propertyId: bill.propertyId, dueDate: parsed.data.dueDate ?? null, notes: parsed.data.notes, updatedAt: new Date() })
    .where(eq(invoices.id, inv.id));
  await audit("invoice_edited", "invoice", inv.id, { total: money.total }, user.id);
  revalidatePath("/admin/invoices");
  redirect(`/admin/invoices/${inv.id}?saved=1`);
}

export async function invoiceAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const parsed = z.object({ id, op: z.enum(["send", "accept", "decline", "cancel"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, parsed.data.id));
  if (!inv) return;
  const action = parsed.data.op;
  if (action === "send") {
    await db.update(invoices).set({ status: inv.status === "draft" ? "sent" : inv.status, updatedAt: new Date() }).where(eq(invoices.id, inv.id));
    await sendMessage({ key: `invoice:${inv.id}:${inv.updatedAt.getTime()}`, template: "invoice_sent", contactId: inv.contactId,
      requestId: inv.requestId, purpose: "request_updates", vars: { number: inv.number, amount: `${inv.total.toFixed(3)} OMR`,
        document: inv.kind === "quote" ? "Quote / عرض سعر" : "Invoice / فاتورة", link: docLink(inv.id) } });
  } else if (action === "accept" && inv.kind === "quote") {
    await db.update(invoices).set({ status: "accepted", updatedAt: new Date() }).where(eq(invoices.id, inv.id));
    const [created] = await db.insert(invoices).values({ kind: "invoice", contactId: inv.contactId, requestId: inv.requestId, quoteId: inv.id,
      propertyId: inv.propertyId, lines: inv.lines, subtotal: inv.subtotal, discount: inv.discount, vatRate: inv.vatRate, vatTotal: inv.vatTotal, total: inv.total,
      passThroughTotal: inv.passThroughTotal, notes: inv.notes, issueDate: today(),
      dueDate: addDays(today(), (await invoiceDesign()).dueDays), createdBy: user.id,
      number: sql`'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 5, '0')` }).returning({ id: invoices.id });
    await audit("quote_accepted", "invoice", inv.id, { invoice: created.id }, user.id);
    redirect(`/admin/invoices/${created.id}`);
  } else {
    await db.update(invoices).set({ status: action === "decline" ? "declined" : "cancelled", updatedAt: new Date() }).where(eq(invoices.id, inv.id));
  }
  await audit(`invoice_${action}`, "invoice", inv.id, {}, user.id);
  revalidatePath(`/admin/invoices/${inv.id}`);
  revalidatePath("/admin/invoices");
}

export async function addPayment(form: FormData) {
  const user = await requireUser([...STAFF]);
  const parsed = z.object({ invoiceId: id, amount: z.coerce.number().positive(), method: z.enum(PAYMENT_METHODS),
    reference: z.string().max(120).default(""), paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  await db.insert(payments).values({ ...parsed.data, createdBy: user.id });
  await recalcInvoice(parsed.data.invoiceId);
  await audit("payment_recorded", "invoice", parsed.data.invoiceId, { amount: parsed.data.amount }, user.id);
  revalidatePath(`/admin/invoices/${parsed.data.invoiceId}`);
  revalidatePath("/admin/invoices");
}

export async function uploadReceipt(form: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireUser([...STAFF]);
  const file = form.get("photo");
  if (!(file instanceof File)) return { ok: false, error: "invalid" };
  const result = await uploadImage(file, "receipts");
  return result.ok ? { ok: true, url: result.url } : { ok: false, error: result.error };
}

export async function addExpense(form: FormData) {
  const user = await requireUser([...STAFF]);
  const parsed = z.object({ spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), category: z.enum(EXPENSE_CATEGORIES),
    description: z.string().max(300).default(""), amount: z.coerce.number().positive(), paidFrom: z.enum(["bank", "petty_cash", "card"]),
    vendor: z.string().max(120).default(""), receiptUrl: z.string().max(500).optional() })
    .safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return;
  const [row] = await db.insert(expenses).values({ ...parsed.data, receiptUrl: parsed.data.receiptUrl ?? null, createdBy: user.id }).returning();
  await audit("expense_added", "expense", row.id, { amount: row.amount, category: row.category }, user.id);
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/finance");
}

export async function deleteExpense(form: FormData) {
  const user = await requireUser(["admin"]);
  const parsed = id.safeParse(form.get("id"));
  if (!parsed.success) return;
  const [row] = await db.delete(expenses).where(eq(expenses.id, parsed.data)).returning();
  if (row) await audit("expense_deleted", "expense", row.id, { amount: row.amount }, user.id);
  revalidatePath("/admin/expenses");
}
