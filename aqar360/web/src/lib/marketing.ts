// Marketing kit: the facts of one listing for AI captions and for the shareable card (drawn in the browser).
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { areas, projects, properties } from "@/db/schema";

import { siteUrl } from "./config";

export async function listingCard(propertyId: number) {
  const [row] = await db.select({ p: properties, a: areas, pr: projects }).from(properties).leftJoin(areas, eq(properties.areaId, areas.id))
    .leftJoin(projects, eq(properties.projectId, projects.id)).where(eq(properties.id, propertyId));
  if (!row) return null;
  const { p, a, pr } = row;
  const rent = p.purpose === "rent" || (!p.salePrice && !!p.rentPrice);
  return {
    id: p.id, code: p.code, kind: p.kind, bedrooms: p.bedrooms, bathrooms: p.bathrooms, sizeSqm: p.sizeSqm, furnished: p.furnished,
    purpose: p.purpose, rent, price: rent ? p.rentPrice : p.salePrice, areaEn: a?.nameEn ?? "", areaAr: a?.nameAr ?? "", project: pr?.nameEn ?? null,
    hasPhoto: !!p.coverImage, link: `${siteUrl}/ar/map?listing=${encodeURIComponent(p.code)}`, isPublic: p.public && p.verified,
    descriptionEn: p.descriptionEn.slice(0, 1200), descriptionAr: p.descriptionAr.slice(0, 1200),
  };
}
export type ListingCard = NonNullable<Awaited<ReturnType<typeof listingCard>>>;

/** What the AI may use: no owner details, only what a buyer would see. */
export async function listingFacts(propertyId: number) {
  const c = await listingCard(propertyId);
  if (!c) return null;
  return { type: c.kind, purpose: c.rent ? "for rent (price per month)" : "for sale", priceOMR: c.price, bedrooms: c.bedrooms, bathrooms: c.bathrooms,
    sizeSqm: c.sizeSqm, furnished: c.furnished, area: `${c.areaEn} / ${c.areaAr}`, project: c.project, reference: c.code,
    link: c.isPublic ? c.link : null, descriptionEn: c.descriptionEn || null, descriptionAr: c.descriptionAr || null };
}
