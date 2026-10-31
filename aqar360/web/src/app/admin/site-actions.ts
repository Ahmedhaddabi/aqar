"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { areas, pages } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { slugify, textToHtml } from "@/lib/text";

const STAFF = ["admin", "manager"] as const;
const coord = (min: number, max: number) => z.coerce.number().min(min).max(max).optional().or(z.literal("").transform(() => undefined));
const ring = z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(4).max(500);
const polygon = z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).length(1) });

export async function saveArea(form: FormData) {
  const user = await requireUser([...STAFF]);
  const target = String(form.get("id") || "new");
  const parsed = z.object({ nameEn: z.string().trim().min(2).max(80), nameAr: z.string().trim().min(2).max(80),
    slug: z.string().trim().max(80).default(""), wilayatId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
    lat: coord(-90, 90), lng: coord(-180, 180), boundary: z.string().max(60_000).default("") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/admin/site/areas/${target}?error=invalid`);
  const v = parsed.data;
  const slug = slugify(v.slug || v.nameEn);
  let boundary: z.infer<typeof polygon> | null = null;
  if (v.boundary) {
    const shape = polygon.safeParse((() => { try { return JSON.parse(v.boundary); } catch { return null; } })());
    if (!shape.success) redirect(`/admin/site/areas/${target}?error=invalid`);
    boundary = shape.data;
  }
  const [clash] = await db.select({ id: areas.id }).from(areas)
    .where(target === "new" ? eq(areas.slug, slug) : and(eq(areas.slug, slug), ne(areas.id, Number(target))));
  if (clash || !slug) redirect(`/admin/site/areas/${target}?error=slug`);
  const values = { nameEn: v.nameEn, nameAr: v.nameAr, slug, wilayatId: v.wilayatId ?? null, lat: v.lat ?? null, lng: v.lng ?? null,
    boundary, active: form.get("active") === "on" };
  let areaId = Number(target);
  if (target === "new") [{ id: areaId }] = await db.insert(areas).values(values).returning({ id: areas.id });
  else await db.update(areas).set(values).where(eq(areas.id, areaId));
  await audit(target === "new" ? "area_created" : "area_updated", "area", areaId, { slug }, user.id);
  revalidateTag("aqar-content");
  redirect(`/admin/site/areas/${areaId}?saved=1`);
}

const faq = z.object({ questionEn: z.string().max(300), answerEn: z.string().max(3000), questionAr: z.string().max(300), answerAr: z.string().max(3000) });

export async function savePage(form: FormData) {
  const user = await requireUser([...STAFF]);
  const target = String(form.get("id") || "new");
  const parsed = z.object({ type: z.string().trim().min(2).max(40), titleEn: z.string().trim().min(2).max(200), titleAr: z.string().trim().min(2).max(200),
    slug: z.string().trim().max(120).default(""), summaryEn: z.string().max(600).default(""), summaryAr: z.string().max(600).default(""),
    bodyEn: z.string().max(60_000).default(""), bodyAr: z.string().max(60_000).default(""),
    factsEn: z.string().max(4000).default(""), factsAr: z.string().max(4000).default(""), sources: z.string().max(4000).default(""),
    areaId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
    lastReviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
    faqs: z.preprocess((s) => { try { return JSON.parse(String(s || "[]")); } catch { return null; } }, z.array(faq).max(30)),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/admin/site/pages/${target}?error=invalid`);
  const v = parsed.data;
  const slug = slugify(v.slug || v.titleEn);
  const [clash] = await db.select({ id: pages.id }).from(pages)
    .where(target === "new" ? eq(pages.slug, slug) : and(eq(pages.slug, slug), ne(pages.id, Number(target))));
  if (clash || !slug) redirect(`/admin/site/pages/${target}?error=slug`);
  const values = { ...v, slug, bodyEn: textToHtml(v.bodyEn), bodyAr: textToHtml(v.bodyAr), sources: v.sources || null,
    areaId: v.areaId ?? null, lastReviewed: v.lastReviewed ?? null, published: form.get("published") === "on", updatedAt: new Date() };
  let pageId = Number(target);
  if (target === "new") [{ id: pageId }] = await db.insert(pages).values(values).returning({ id: pages.id });
  else await db.update(pages).set(values).where(eq(pages.id, pageId));
  await audit(target === "new" ? "page_created" : "page_updated", "page", pageId, { slug, published: values.published }, user.id);
  revalidateTag("aqar-content");
  redirect(`/admin/site/pages/${pageId}?saved=1`);
}
