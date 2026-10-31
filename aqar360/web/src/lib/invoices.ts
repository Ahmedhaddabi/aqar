// Invoice status from the payments recorded against it (shared by staff actions and online payments).
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { invoices, payments } from "@/db/schema";

export async function paidSoFar(invoiceId: number) {
  const [{ paid }] = await db.select({ paid: sql<number>`coalesce(sum(${payments.amount}), 0)::float` }).from(payments)
    .where(eq(payments.invoiceId, invoiceId));
  return paid;
}

export async function recalcInvoice(invoiceId: number) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv || inv.kind !== "invoice" || inv.status === "cancelled") return;
  const paid = await paidSoFar(invoiceId);
  const status = paid >= inv.total - 0.0005 ? "paid" : paid > 0 ? "partly_paid" : inv.status === "draft" ? "draft" : "sent";
  await db.update(invoices).set({ status, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
  // Strategy §6: work is scheduled once the order is paid. Jobs are created once per invoice (no-op afterwards).
  if (status === "paid" || status === "partly_paid") {
    const { createJobsFromInvoice } = await import("./jobs");
    await createJobsFromInvoice(invoiceId).catch((e) => console.error("jobs from invoice failed:", (e as Error).message));
  }
}
