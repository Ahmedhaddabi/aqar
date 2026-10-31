"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { messageTemplates } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { TEMPLATE_KEYS } from "@/lib/messages";

/** Saves both languages of one message; "reset" goes back to the built-in wording. */
export async function restoreTemplate(form: FormData) {
  form.set("restore", "1");
  return saveTemplate(form);
}

export async function saveTemplate(form: FormData) {
  const user = await requireUser(["admin", "manager"]);
  const parsed = z.object({ key: z.enum(TEMPLATE_KEYS), restore: z.string().optional(),
    subjectAr: z.string().trim().max(200).default(""), bodyAr: z.string().trim().max(4000).default(""),
    subjectEn: z.string().trim().max(200).default(""), bodyEn: z.string().trim().max(4000).default("") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const v = parsed.data;
  await db.transaction(async (tx) => {
    for (const language of ["ar", "en"] as const) {
      await tx.delete(messageTemplates).where(and(eq(messageTemplates.key, v.key), eq(messageTemplates.language, language)));
      const subject = language === "ar" ? v.subjectAr : v.subjectEn;
      const body = language === "ar" ? v.bodyAr : v.bodyEn;
      if (!v.restore && subject && body) await tx.insert(messageTemplates).values({ key: v.key, language, subject, body, updatedBy: user.id });
    }
  });
  await audit(v.restore ? "template_reset" : "template_saved", "message_template", v.key, {}, user.id);
  revalidatePath("/admin/messages");
}
