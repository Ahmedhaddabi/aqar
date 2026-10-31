"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canSeeRequest } from "@/admin/crm";
import { db } from "@/db";
import { DOC_OWNERS, documents } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { uploadImage } from "@/lib/storage";

const PATHS: Record<(typeof DOC_OWNERS)[number], string> = { contact: "/admin/customers", property: "/admin/properties", request: "/admin/requests",
  job: "/admin/jobs", employee: "/admin/hr/employees", project: "/admin/projects" };

/** One file per call (fits Vercel's request limit); PDF or image, type checked from the bytes. */
export async function uploadDocument(form: FormData): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = z.object({ ownerType: z.enum(DOC_OWNERS), ownerId: z.coerce.number().int().positive(), title: z.string().trim().min(1).max(160),
    category: z.string().max(30).default("other") }).safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  const file = form.get("file");
  if (!parsed.success || !(file instanceof File) || file.size > 4 * 1024 * 1024) return { ok: false };
  if (parsed.data.ownerType === "employee" && user.role === "agent") return { ok: false };
  if (parsed.data.ownerType === "request" && user.role === "agent" && !(await canSeeRequest(user, parsed.data.ownerId))) return { ok: false };
  const stored = await uploadImage(file, "docs");
  if (!stored.ok) return { ok: false };
  const [doc] = await db.insert(documents).values({ ...parsed.data, url: stored.url, mime: file.type.slice(0, 80), size: file.size,
    shared: form.get("shared") === "on", uploadedBy: user.id }).returning({ id: documents.id });
  await audit("document_uploaded", parsed.data.ownerType, parsed.data.ownerId, { document: doc.id, title: parsed.data.title }, user.id);
  revalidatePath(`${PATHS[parsed.data.ownerType]}/${parsed.data.ownerId}`);
  return { ok: true };
}

export async function removeDocument(form: FormData) {
  const user = await requireUser(["admin", "manager"]);
  const id = Number(form.get("id"));
  const [doc] = Number.isInteger(id) ? await db.delete(documents).where(eq(documents.id, id)).returning() : [];
  if (!doc) return;
  await audit("document_removed", doc.ownerType, doc.ownerId, { document: doc.id, title: doc.title }, user.id);
  revalidatePath(`${PATHS[doc.ownerType]}/${doc.ownerId}`);
}

export async function toggleShared(form: FormData) {
  const user = await requireUser(["admin", "manager"]);
  const id = Number(form.get("id"));
  const [doc] = Number.isInteger(id) ? await db.select().from(documents).where(eq(documents.id, id)) : [];
  if (!doc) return;
  await db.update(documents).set({ shared: !doc.shared }).where(and(eq(documents.id, id)));
  await audit(doc.shared ? "document_unshared" : "document_shared", doc.ownerType, doc.ownerId, { document: doc.id }, user.id);
  revalidatePath(`${PATHS[doc.ownerType]}/${doc.ownerId}`);
}
