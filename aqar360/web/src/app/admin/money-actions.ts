"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { EXPENSE_CATEGORIES, expenses, invoices, PAYMENT_METHODS, payments } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { docLink } from "@/lib/doc-link";
import { recalcInvoice } from "@/lib/invoices";
import { sendMessage } from "@/lib/messages";
import { uploadImage } from "@/lib/storage";

const STAFF = ["admin", "manager"] as const;
const id = z.coerce.number().int().positive();
const today = () => new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10); // Oman date

const line = z.object({ description: z.string().trim().min(1).max(300), qty: z.coerce.number().positive().max(10_000),
  unitPrice: z.coerce.number().min(0).max(10_000_000), serviceCode: z.string().max(40).nullish(), passThrough: z.boolean().optional() });

export async function createInvoice(form: FormData) {
  const user = await requireUser([...STAFF]);
  const parsed = z.object({ kind: z.enum(["quote", "invoice"]), contactId: id, requestId: id.optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), notes: z.string().max(2000).default(""),
    lines: z.preprocess((v) => JSON.parse(String(v || "[]")), z.array(line).min(1).max(50)) })
    .safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) redirect("/admin/invoices?error=invalid");
  const { kind, lines, ...rest } = parsed.data;
  const total = lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);
  const media = lines.filter((l) => l.passThrough).reduce((a, l) => a + l.qty * l.unitPrice, 0);
  const prefix = kind === "quote" ? "QUO" : "INV";
  const seq = kind === "quote" ? "quote_number_seq" : "invoice_number_seq";
  const [created] = await db.insert(invoices).values({ kind, ...rest, requestId: rest.requestId ?? null, lines, total, passThroughTotal: media,
    number: sql`${prefix} || '-' || to_char(now(), 'YYYY') || '-' || lpad(nextval(${seq})::text, 5, '0')`,
    issueDate: today(), dueDate: rest.dueDate ?? null, createdBy: user.id }).returning({ id: invoices.id });
  await audit(`${kind}_created`, "invoice", created.id, { total }, user.id);
  redirect(`/admin/invoices/${created.id}`);
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
      lines: inv.lines, total: inv.total, passThroughTotal: inv.passThroughTotal, notes: inv.notes, issueDate: today(),
      dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10), createdBy: user.id,
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
