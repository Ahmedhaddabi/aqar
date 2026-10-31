"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { EXPENSE_CATEGORIES, expenseClaims, expenses, users } from "@/db/schema";
import { audit, canOpen, requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { uploadImage } from "@/lib/storage";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Any staff member may upload the receipt for their own claim. */
export async function uploadClaimReceipt(form: FormData): Promise<{ ok: boolean; url?: string }> {
  await requireUser();
  const file = form.get("photo");
  if (!(file instanceof File)) return { ok: false };
  const result = await uploadImage(file, "receipts");
  return result.ok ? { ok: true, url: result.url } : { ok: false };
}

export async function addClaim(form: FormData) {
  const me = await requireUser();
  const parsed = z.object({ spentOn: day, category: z.enum(EXPENSE_CATEGORIES), amount: z.coerce.number().positive().max(100_000),
    description: z.string().trim().min(2).max(300), receiptUrl: z.string().max(500).optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const [claim] = await db.insert(expenseClaims).values({ ...parsed.data, receiptUrl: parsed.data.receiptUrl || null, userId: me.id }).returning();
  await audit("claim_submitted", "expense_claim", claim.id, { amount: claim.amount }, me.id);
  await notify({ app: "erp", roles: ["admin", "manager"] }, { kind: "claim_new", title: `${me.name} · ${claim.amount.toFixed(3)} OMR`,
    href: "/admin/claims?tab=approve", key: `claim_new:${claim.id}` });
  revalidatePath("/admin/claims");
}

/** Approval engine for staff spending: managers approve or reject; nobody approves their own claim. */
export async function approveClaim(form: FormData) {
  form.set("decision", "approved");
  return decideClaim(form);
}

export async function rejectClaim(form: FormData) {
  form.set("decision", "rejected");
  return decideClaim(form);
}

async function decideClaim(form: FormData) {
  const me = await requireUser(["admin", "manager"]);
  if (!canOpen(me, "erp")) return;
  const parsed = z.object({ id: z.coerce.number().int().positive(), decision: z.enum(["approved", "rejected"]), note: z.string().max(300).default("") })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const [claim] = await db.select().from(expenseClaims).where(eq(expenseClaims.id, parsed.data.id));
  if (!claim || claim.status !== "pending" || claim.userId === me.id) return;
  await db.update(expenseClaims).set({ status: parsed.data.decision, decidedBy: me.id, decidedAt: new Date(), decisionNote: parsed.data.note })
    .where(and(eq(expenseClaims.id, claim.id), eq(expenseClaims.status, "pending")));
  await audit(`claim_${parsed.data.decision}`, "expense_claim", claim.id, {}, me.id);
  await notify({ userIds: [claim.userId] }, { kind: "claim_decided", title: `${claim.amount.toFixed(3)} OMR · ${claim.description}`, href: "/admin/claims" });
  revalidatePath("/admin/claims");
  revalidatePath("/admin/approvals");
}

/** Paying the staff member back records the company expense with the original receipt. */
export async function reimburseClaim(form: FormData) {
  const me = await requireUser(["admin", "manager"]);
  if (!canOpen(me, "erp")) return;
  const parsed = z.object({ id: z.coerce.number().int().positive(), reimbursedOn: day, reference: z.string().max(120).default("") })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const [row] = await db.select({ claim: expenseClaims, name: users.name }).from(expenseClaims).innerJoin(users, eq(expenseClaims.userId, users.id))
    .where(eq(expenseClaims.id, parsed.data.id));
  if (!row || row.claim.status !== "approved") return;
  const [expense] = await db.insert(expenses).values({ spentOn: row.claim.spentOn, category: row.claim.category, amount: row.claim.amount,
    description: `Claim: ${row.claim.description}${parsed.data.reference ? ` (${parsed.data.reference})` : ""}`, paidFrom: "bank", vendor: row.name,
    receiptUrl: row.claim.receiptUrl, createdBy: me.id }).returning({ id: expenses.id });
  await db.update(expenseClaims).set({ status: "reimbursed", reimbursedOn: parsed.data.reimbursedOn, expenseId: expense.id })
    .where(eq(expenseClaims.id, row.claim.id));
  await audit("claim_reimbursed", "expense_claim", row.claim.id, { expense: expense.id }, me.id);
  await notify({ userIds: [row.claim.userId] }, { kind: "claim_decided", title: `${row.claim.amount.toFixed(3)} OMR · ${row.claim.description}`, href: "/admin/claims" });
  revalidatePath("/admin/claims");
}
