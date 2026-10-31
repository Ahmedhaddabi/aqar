"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { omanToday } from "@/admin/hr";
import { db } from "@/db";
import { approvals, invoices, payments } from "@/db/schema";
import { audit, requireApp } from "@/lib/auth";
import { paidSoFar, recalcInvoice } from "@/lib/invoices";
import { notify } from "@/lib/notify";

const id = z.coerce.number().int().positive();

/** Refunds never happen directly: a manager asks, an admin (not the same person) approves (strategy §26.3). */
export async function requestRefund(form: FormData) {
  const user = await requireApp("erp", ["admin", "manager"]);
  const parsed = z.object({ invoiceId: id, amount: z.coerce.number().positive(), reason: z.string().trim().min(3).max(300),
    method: z.enum(["bank", "cash", "card", "cheque"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/admin/invoices/${form.get("invoiceId")}?refund=invalid`);
  const paid = await paidSoFar(parsed.data.invoiceId);
  if (parsed.data.amount > paid + 0.0005) redirect(`/admin/invoices/${parsed.data.invoiceId}?refund=invalid`);
  const [row] = await db.insert(approvals).values({ kind: "refund", ...parsed.data, requestedBy: user.id }).returning();
  const [inv] = await db.select({ number: invoices.number }).from(invoices).where(eq(invoices.id, parsed.data.invoiceId));
  await audit("refund_requested", "invoice", parsed.data.invoiceId, { amount: parsed.data.amount, approval: row.id }, user.id);
  await notify({ roles: ["admin"] }, { kind: "refund_new", title: `${inv?.number} · ${parsed.data.amount.toFixed(3)} OMR`, href: "/admin/approvals",
    key: `refund_new:${row.id}` });
  redirect(`/admin/invoices/${parsed.data.invoiceId}?refund=requested`);
}

async function decideRefund(form: FormData, decision: "approved" | "rejected") {
  const user = await requireApp("erp", ["admin"]);
  const parsed = z.object({ id, note: z.string().max(300).default("") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const [a] = await db.select().from(approvals).where(eq(approvals.id, parsed.data.id));
  if (!a || a.status !== "pending" || a.requestedBy === user.id || !a.invoiceId) return;
  const [won] = await db.update(approvals).set({ status: decision, decidedBy: user.id, decidedAt: new Date(), decisionNote: parsed.data.note })
    .where(and(eq(approvals.id, a.id), eq(approvals.status, "pending"))).returning();
  if (!won) return;
  if (decision === "approved") {
    // A refund is a negative payment; its receipt prints as a credit note.
    await db.insert(payments).values({ invoiceId: a.invoiceId, amount: -a.amount, method: "refund", reference: `Refund #${a.id}: ${a.reason}`.slice(0, 120),
      paidOn: omanToday(), createdBy: user.id });
    await recalcInvoice(a.invoiceId);
  }
  await audit(`refund_${decision}`, "invoice", a.invoiceId, { approval: a.id, amount: a.amount }, user.id);
  await notify({ userIds: [a.requestedBy] }, { kind: "refund_decided", title: `${a.amount.toFixed(3)} OMR · ${a.reason}`, href: `/admin/invoices/${a.invoiceId}` });
  revalidatePath("/admin/approvals");
  revalidatePath(`/admin/invoices/${a.invoiceId}`);
}

export async function approveRefund(form: FormData) { return decideRefund(form, "approved"); }
export async function rejectRefund(form: FormData) { return decideRefund(form, "rejected"); }
