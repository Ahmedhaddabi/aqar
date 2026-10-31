"use server";

import { del } from "@vercel/blob";
import { and, asc, eq, max, ne, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { AVAILABILITY, images, projects, projectUnitTypes, properties, PROPERTY_STATUS } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { matchSupply } from "@/lib/matching";
import { uploadImage } from "@/lib/storage";
import { slugify, textToHtml } from "@/lib/text";

import type { FormState } from "./actions";

const EDITORS = ["admin", "manager"] as const;
const optNum = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().finite().nonnegative().nullable());
const optInt = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(1000).nullable());
const optText = (max = 300) => z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(max));
const check = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const optDate = z.preprocess((v) => (v ? v : null), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const coord = (limit: number) => z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(-limit).max(limit).nullable());

/** Public pages read through a 5-minute cache; any change here refreshes them at once. */
function refreshWebsite() {
  revalidateTag("aqar-content");
  revalidatePath("/admin/listings");
}

const unitTypeRow = z.object({ type: z.string().trim().min(1).max(60), bedrooms: optInt, sizeFrom: optNum, sizeTo: optNum,
  priceFrom: optNum, priceTo: optNum, available: optInt });

const projectSchema = z.object({
  id: z.coerce.number().int().positive().optional(), nameEn: z.string().trim().min(1).max(120), nameAr: optText(120),
  developer: optText(120), category: z.enum(["Residential", "Commercial", "Mixed-Use", "Land Plots"]),
  areaId: z.preprocess((v) => (v ? v : null), z.coerce.number().int().positive().nullable()),
  lat: coord(90), lng: coord(180), constructionStatus: z.preprocess((v) => (v ? v : null), z.enum(["Pre-Launch", "Under Construction", "Ready"]).nullable()),
  handover: optDate, priceFrom: optNum, priceTo: optNum, paymentPlanEn: optText(1000), paymentPlanAr: optText(1000),
  descriptionEn: optText(5000), descriptionAr: optText(5000), foreignOwnership: check, availability: z.enum(AVAILABILITY),
  public: check, verified: check, unitTypes: z.preprocess((v) => JSON.parse(String(v || "[]")), z.array(unitTypeRow).max(40)),
});

async function uniqueSlug(name: string, ownId?: number) {
  const base = slugify(name) || "project";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const [taken] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.slug, slug), ownId ? ne(projects.id, ownId) : undefined));
    if (!taken) return slug;
  }
}

export async function saveProject(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser([...EDITORS]);
  const parsed = projectSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "invalid", fields: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), "invalid"])) };
  const { id, unitTypes, descriptionEn, descriptionAr, ...p } = parsed.data;
  // Price range follows the unit types unless typed in.
  const prices = unitTypes.flatMap((u) => [u.priceFrom, u.priceTo]).filter((v): v is number => !!v);
  const values = { ...p, descriptionEn: textToHtml(descriptionEn), descriptionAr: textToHtml(descriptionAr),
    priceFrom: p.priceFrom ?? (prices.length ? Math.min(...prices) : null), priceTo: p.priceTo ?? (prices.length ? Math.max(...prices) : null),
    updatedAt: new Date() };
  let projectId = id;
  if (id) {
    await db.update(projects).set(values).where(eq(projects.id, id));
  } else {
    const [created] = await db.insert(projects).values({ ...values, slug: await uniqueSlug(p.nameEn) }).returning({ id: projects.id });
    projectId = created.id;
  }
  await db.delete(projectUnitTypes).where(eq(projectUnitTypes.projectId, projectId!));
  if (unitTypes.length) await db.insert(projectUnitTypes).values(unitTypes.map((u, i) => ({ ...u, projectId: projectId!, sort: i })));
  await audit(id ? "project_updated" : "project_created", "project", projectId!, { public: p.public, verified: p.verified }, user.id);
  await matchSupply({ projectIds: [projectId!] });
  refreshWebsite();
  if (!id) redirect(`/admin/projects/${projectId}?saved=1`);
  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: true };
}

const propertySchema = z.object({
  id: z.coerce.number().int().positive().optional(), title: optText(120),
  kind: z.enum(["Apartment", "Villa", "Land", "Building", "Shop", "Office", "Warehouse", "Showroom", "Commercial", "Other"]),
  purpose: z.enum(["sale", "rent", "sale_or_rent"]), salePrice: optNum, rentPrice: optNum, bedrooms: optInt, bathrooms: optInt,
  sizeSqm: optNum, furnished: z.preprocess((v) => (v ? v : null), z.enum(["Furnished", "Unfurnished"]).nullable()),
  areaId: z.preprocess((v) => (v ? v : null), z.coerce.number().int().positive().nullable()), lat: coord(90), lng: coord(180),
  showExactLocation: check, status: z.enum(PROPERTY_STATUS), public: check, verified: check, ownerName: optText(120),
  ownerPhone: optText(30), descriptionEn: optText(5000), descriptionAr: optText(5000),
});

export async function saveProperty(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser([...EDITORS]);
  const parsed = propertySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "invalid", fields: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), "invalid"])) };
  const { id, descriptionEn, descriptionAr, ...p } = parsed.data;
  const values = { ...p, descriptionEn: textToHtml(descriptionEn), descriptionAr: textToHtml(descriptionAr), updatedAt: new Date() };
  let propertyId = id;
  if (id) {
    await db.update(properties).set(values).where(eq(properties.id, id));
  } else {
    const [created] = await db.insert(properties).values({ ...values,
      code: sql`'AQ-' || lpad(nextval('property_code_seq')::text, 5, '0')` }).returning({ id: properties.id });
    propertyId = created.id;
  }
  await audit(id ? "property_updated" : "property_created", "property", propertyId!, { public: p.public, status: p.status }, user.id);
  await matchSupply({ propertyIds: [propertyId!] });
  refreshWebsite();
  if (!id) redirect(`/admin/properties/${propertyId}?saved=1`);
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

// ---- Units inside a project ------------------------------------------------------------------------------------
const UNIT_KIND: Record<string, string> = { Office: "Office", Shop: "Shop", Showroom: "Showroom", Warehouse: "Warehouse",
  "Land Plot": "Land", Villa: "Villa", Townhouse: "Villa" };

export async function addUnit(form: FormData) {
  const user = await requireUser([...EDITORS]);
  const parsed = z.object({ projectId: z.coerce.number().int().positive(), unitNumber: z.string().trim().min(1).max(30),
    floor: optInt, unitType: optText(60), bedrooms: optInt, sizeSqm: optNum, salePrice: optNum, status: z.enum(PROPERTY_STATUS) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { projectId, unitType, ...u } = parsed.data;
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return;
  const [unit] = await db.insert(properties).values({ ...u, unitType: unitType || null, projectId, kind: UNIT_KIND[unitType] ?? "Apartment",
    purpose: "sale", areaId: project.areaId, title: `${project.nameEn} ${u.unitNumber}`, public: project.public,
    verified: project.verified, code: sql`'AQ-' || lpad(nextval('property_code_seq')::text, 5, '0')` }).returning({ id: properties.id });
  await audit("unit_created", "property", unit.id, { projectId }, user.id);
  await matchSupply({ propertyIds: [unit.id] });
  refreshWebsite();
  revalidatePath(`/admin/projects/${projectId}`);
}

export async function setUnitStatus(form: FormData) {
  const user = await requireUser([...EDITORS]);
  const parsed = z.object({ id: z.coerce.number().int().positive(), status: z.enum(PROPERTY_STATUS) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const [unit] = await db.update(properties).set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(properties.id, parsed.data.id)).returning({ projectId: properties.projectId });
  await audit("unit_status", "property", parsed.data.id, { status: parsed.data.status }, user.id);
  await matchSupply({ propertyIds: [parsed.data.id] });
  refreshWebsite();
  if (unit?.projectId) revalidatePath(`/admin/projects/${unit.projectId}`);
}

// ---- Photos -----------------------------------------------------------------------------------------------------
const ownerSchema = z.object({ ownerType: z.enum(["project", "property"]), ownerId: z.coerce.number().int().positive() });
const editPath = (type: "project" | "property", id: number) => `/admin/${type === "project" ? "projects" : "properties"}/${id}`;

async function setCoverFor(type: "project" | "property", id: number, url: string | null) {
  if (type === "project") await db.update(projects).set({ coverImage: url, updatedAt: new Date() }).where(eq(projects.id, id));
  else await db.update(properties).set({ coverImage: url, updatedAt: new Date() }).where(eq(properties.id, id));
}

/** One (already shrunk) photo per call, so every request stays under the hosting upload limit. */
export async function uploadPhoto(form: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser([...EDITORS]);
  const owner = ownerSchema.safeParse(Object.fromEntries(form));
  const file = form.get("photo");
  if (!owner.success || !(file instanceof File)) return { ok: false, error: "invalid" };
  const { ownerType, ownerId } = owner.data;
  const result = await uploadImage(file, ownerType === "project" ? "projects" : "properties");
  if (!result.ok) return { ok: false, error: result.error };
  const [last] = await db.select({ n: max(images.sort) }).from(images).where(and(eq(images.ownerType, ownerType), eq(images.ownerId, ownerId)));
  await db.insert(images).values({ ownerType, ownerId, url: result.url, sort: (last?.n ?? 0) + 1 });
  const [current] = ownerType === "project"
    ? await db.select({ cover: projects.coverImage }).from(projects).where(eq(projects.id, ownerId))
    : await db.select({ cover: properties.coverImage }).from(properties).where(eq(properties.id, ownerId));
  if (!current?.cover) await setCoverFor(ownerType, ownerId, result.url);
  await audit("photo_uploaded", ownerType, ownerId, {}, user.id);
  refreshWebsite();
  revalidatePath(editPath(ownerType, ownerId));
  return { ok: true };
}

export async function makeCover(form: FormData) {
  await requireUser([...EDITORS]);
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const [image] = await db.select().from(images).where(eq(images.id, parsed.data.id));
  if (!image) return;
  await setCoverFor(image.ownerType, image.ownerId, image.url);
  refreshWebsite();
  revalidatePath(editPath(image.ownerType, image.ownerId));
}

export async function removePhoto(form: FormData) {
  const user = await requireUser([...EDITORS]);
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const [image] = await db.delete(images).where(eq(images.id, parsed.data.id)).returning();
  if (!image) return;
  if (process.env.BLOB_READ_WRITE_TOKEN && image.url.includes(".blob.vercel-storage.com")) await del(image.url).catch(() => undefined);
  const [next] = await db.select().from(images).where(and(eq(images.ownerType, image.ownerType), eq(images.ownerId, image.ownerId)))
    .orderBy(asc(images.sort)).limit(1);
  const cover = image.ownerType === "project"
    ? (await db.select({ c: projects.coverImage }).from(projects).where(eq(projects.id, image.ownerId)))[0]?.c
    : (await db.select({ c: properties.coverImage }).from(properties).where(eq(properties.id, image.ownerId)))[0]?.c;
  if (cover === image.url) await setCoverFor(image.ownerType, image.ownerId, next?.url ?? null);
  await audit("photo_removed", image.ownerType, image.ownerId, {}, user.id);
  refreshWebsite();
  revalidatePath(editPath(image.ownerType, image.ownerId));
}
