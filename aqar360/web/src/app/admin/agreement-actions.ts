"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { canSeeRequest } from "@/admin/crm";
import { db } from "@/db";
import { agreements } from "@/db/schema";
import { AGREEMENT_TEMPLATES, type AgreementTemplate, createAgreement, sendAgreement } from "@/lib/agreements";
import { audit, requireApp } from "@/lib/auth";

const id = z.coerce.number().int().positive();

export async function createAgreementForm(form: FormData) {
  const user = await requireApp("crm");
  const parsed = z.object({ contactId: id, requestId: id.optional(), template: z.enum(Object.keys(AGREEMENT_TEMPLATES) as [AgreementTemplate, ...AgreementTemplate[]]) })
    .safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return;
  if (parsed.data.requestId && !(await canSeeRequest(user, parsed.data.requestId))) return;
  const row = await createAgreement({ ...parsed.data, userId: user.id });
  if (row) redirect(`/admin/agreements/${row.id}`);
}

export async function saveAgreementDraft(form: FormData) {
  const user = await requireApp("crm");
  const parsed = z.object({ id, title: z.string().trim().min(3).max(200), body: z.string().trim().min(10).max(30_000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/admin/agreements/${Number(form.get("id"))}?error=1`);
  await db.update(agreements).set({ title: parsed.data.title, body: parsed.data.body, updatedAt: new Date() })
    .where(and(eq(agreements.id, parsed.data.id), eq(agreements.status, "draft")));
  await audit("agreement_edited", "agreement", parsed.data.id, {}, user.id);
  if (form.get("send") === "1") {
    await sendAgreement(parsed.data.id, user.id);
    redirect(`/admin/agreements/${parsed.data.id}?sent=1`);
  }
  redirect(`/admin/agreements/${parsed.data.id}?saved=1`);
}

/** Sends the link again (same text, same hash). */
export async function resendAgreement(form: FormData) {
  const user = await requireApp("crm");
  const agreementId = Number(form.get("id"));
  const [a] = await db.select().from(agreements).where(eq(agreements.id, agreementId));
  if (a?.status !== "sent") return;
  await sendAgreement(agreementId, user.id);
  redirect(`/admin/agreements/${agreementId}?sent=1`);
}

export async function cancelAgreement(form: FormData) {
  const user = await requireApp("crm");
  const agreementId = Number(form.get("id"));
  await db.update(agreements).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(agreements.id, agreementId), inArray(agreements.status, ["draft", "sent"])));
  await audit("agreement_cancelled", "agreement", agreementId, {}, user.id);
  revalidatePath(`/admin/agreements/${agreementId}`);
}
