// What an owner sees about their own properties in the portal: views, interest, viewings and their outcomes, offers,
// and how their price sits in the market. Counts and outcomes only; never a buyer's name or contact details.
import { and, count, desc, eq, gte, inArray, isNotNull, ne, or, sum } from "drizzle-orm";

import { db } from "@/db";
import { activities, areas, contacts, matches, OPEN_STATUSES, offers, properties, propertyViews, requests, savedProperties } from "@/db/schema";

import { muscatDay } from "./viewings";

const median = (values: number[]) => {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

/** Properties this contact owns: accepted from their own "market my property" request, or entered by staff with their phone. */
export async function ownedProperties(contactId: number) {
  const [c] = await db.select().from(contacts).where(eq(contacts.id, contactId));
  if (!c) return [];
  const listing = await db.select({ details: requests.details }).from(requests).where(and(eq(requests.contactId, contactId), eq(requests.kind, "listing")));
  const fromRequests = listing.map((r) => Number((r.details as { review?: { propertyId?: unknown } }).review?.propertyId)).filter(Number.isInteger);
  const where = or(...(fromRequests.length ? [inArray(properties.id, fromRequests)] : []), ...(c.phone ? [eq(properties.ownerPhone, c.phone)] : []));
  if (!where) return [];
  return db.select({ p: properties, area: areas }).from(properties).leftJoin(areas, eq(properties.areaId, areas.id)).where(where)
    .orderBy(desc(properties.updatedAt));
}

export async function ownerDashboard(contactId: number) {
  const owned = await ownedProperties(contactId);
  if (!owned.length) return [];
  const ids = owned.map((o) => o.p.id);
  const since30 = muscatDay(new Date(Date.now() - 29 * 86_400_000));
  const [views, views30, asked, suggested, saved, viewingRows, offerRows, market, buyers] = await Promise.all([
    db.select({ id: propertyViews.propertyId, n: sum(propertyViews.count) }).from(propertyViews).where(inArray(propertyViews.propertyId, ids)).groupBy(propertyViews.propertyId),
    db.select({ id: propertyViews.propertyId, n: sum(propertyViews.count) }).from(propertyViews)
      .where(and(inArray(propertyViews.propertyId, ids), gte(propertyViews.day, since30))).groupBy(propertyViews.propertyId),
    db.select({ id: requests.interestPropertyId, n: count() }).from(requests).where(inArray(requests.interestPropertyId, ids)).groupBy(requests.interestPropertyId),
    db.select({ id: matches.propertyId, n: count() }).from(matches).where(and(inArray(matches.propertyId, ids), eq(matches.status, "sent"))).groupBy(matches.propertyId),
    db.select({ id: savedProperties.propertyId, n: count() }).from(savedProperties).where(inArray(savedProperties.propertyId, ids)).groupBy(savedProperties.propertyId),
    db.select({ id: activities.propertyId, at: activities.dueAt, done: activities.done, result: activities.result }).from(activities)
      .where(and(eq(activities.type, "viewing"), inArray(activities.propertyId, ids))).orderBy(desc(activities.dueAt)),
    db.select({ id: offers.propertyId, amount: offers.amount, status: offers.status, at: offers.createdAt }).from(offers)
      .where(and(inArray(offers.propertyId, ids), ne(offers.status, "withdrawn"))).orderBy(desc(offers.amount)),
    db.select({ id: properties.id, areaId: properties.areaId, kind: properties.kind, sale: properties.salePrice, rent: properties.rentPrice, bedrooms: properties.bedrooms })
      .from(properties).where(and(eq(properties.status, "available"), isNotNull(properties.areaId))),
    db.select({ areaIds: requests.areaIds, subtype: requests.subtype, budgetMax: requests.budgetMax, propertyType: requests.propertyType }).from(requests)
      .where(and(eq(requests.kind, "search"), inArray(requests.status, [...OPEN_STATUSES]))),
  ]);
  const n = (rows: { id: number | null; n: unknown }[], id: number) => Number(rows.find((r) => r.id === id)?.n ?? 0);
  return owned.map(({ p, area }) => {
    const rent = p.purpose === "rent" || (!p.salePrice && !!p.rentPrice);
    const price = rent ? p.rentPrice : p.salePrice;
    const similar = market.filter((m) => m.id !== p.id && m.areaId === p.areaId && m.kind === p.kind && (!p.bedrooms || !m.bedrooms || m.bedrooms === p.bedrooms))
      .map((m) => (rent ? m.rent : m.sale) ?? 0).filter((v) => v > 0);
    const looking = buyers.filter((b) => p.areaId && b.areaIds.includes(p.areaId) && (rent ? b.subtype === "Rent" : b.subtype !== "Rent")
      && (!b.propertyType || b.propertyType === p.kind));
    const v = viewingRows.filter((r) => r.id === p.id);
    return {
      property: p, areaEn: area?.nameEn ?? "", areaAr: area?.nameAr ?? "", rent, price,
      views: n(views, p.id), views30: n(views30, p.id),
      enquiries: n(asked, p.id), suggested: n(suggested, p.id), saved: n(saved, p.id),
      viewings: { done: v.filter((x) => x.done && x.result && x.result !== "cancelled").length, upcoming: v.filter((x) => !x.done && x.at && x.at > new Date()).length,
        results: v.filter((x) => x.result && x.result !== "cancelled").slice(0, 6).map((x) => ({ at: x.at, result: x.result! })) },
      offers: { count: offerRows.filter((o) => o.id === p.id).length, best: offerRows.find((o) => o.id === p.id && o.status !== "rejected")?.amount ?? null },
      // Only with at least three comparable listings, so no single competitor's price is revealed.
      market: similar.length >= 3 ? { median: median(similar), count: similar.length } : null,
      demand: { looking: looking.length, withinPrice: price ? looking.filter((b) => !b.budgetMax || b.budgetMax >= price).length : null },
    };
  });
}
