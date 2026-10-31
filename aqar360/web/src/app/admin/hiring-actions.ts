"use server";

import { eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { applications, JOB_STAGES, jobs, SUPPLIER_STAGES } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { slugify, textToHtml } from "@/lib/text";

const STAFF = ["admin", "manager"] as const;
const id = z.coerce.number().int().positive();

export async function updateApplication(form: FormData) {
  const user = await requireUser([...STAFF]);
  const parsed = z.object({ id, status: z.enum([...new Set([...JOB_STAGES, ...SUPPLIER_STAGES])] as [string, ...string[]]).optional(),
    notes: z.string().max(4000).optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { id: appId, ...changes } = parsed.data;
  await db.update(applications).set(changes as Partial<typeof applications.$inferInsert>).where(eq(applications.id, appId));
  await audit("application_updated", "application", appId, changes.status ? { status: changes.status } : {}, user.id);
  revalidatePath(`/admin/hiring/${appId}`);
}

export async function saveJob(form: FormData) {
  const user = await requireUser([...STAFF]);
  const target = String(form.get("id") || "new");
  const parsed = z.object({ titleEn: z.string().trim().min(2).max(160), titleAr: z.string().trim().max(160).default(""),
    descriptionEn: z.string().max(8000).default(""), descriptionAr: z.string().max(8000).default(""),
    location: z.string().trim().max(80).default("Muscat"), employmentType: z.string().trim().max(40).default("Full-time"),
    closesOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/admin/hiring/jobs/${target}?error=1`);
  const v = parsed.data;
  const values = { ...v, descriptionEn: textToHtml(v.descriptionEn), descriptionAr: textToHtml(v.descriptionAr),
    closesOn: v.closesOn ?? null, published: form.get("published") === "on" };
  let jobId = Number(target);
  if (target === "new") {
    const base = slugify(v.titleEn) || "job";
    [{ id: jobId }] = await db.insert(jobs).values({ ...values, slug: `${base}-${Date.now().toString(36)}` }).returning({ id: jobs.id });
  } else {
    await db.update(jobs).set(values).where(eq(jobs.id, jobId));
  }
  await audit(target === "new" ? "job_created" : "job_updated", "job", jobId, { published: values.published }, user.id);
  revalidateTag("aqar-content");
  redirect(`/admin/hiring/jobs/${jobId}?saved=1`);
}
