// Market intelligence from our own data (strategy §27.2 Demand Intelligence & Heatmap): who is looking for what, where,
// at which budget; what we can offer; where demand has no supply; which sources turn into deals.
import { and, eq, gt, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import { agentSources, areas, marketListings, matches, OPEN_STATUSES, properties, requests } from "@/db/schema";

const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type AreaStat = {
  id: number; nameAr: string; nameEn: string; lat: number | null; lng: number | null; boundary: unknown;
  demand: number; demandBuy: number; demandRent: number; unmet: number; supply: number; supplyBuy: number; supplyRent: number;
  medianBudgetBuy: number | null; medianBudgetRent: number | null; medianPriceSale: number | null; medianRent: number | null;
  gap: number; // demand minus supply: positive = we need more listings here
  /** Ads on other sites (Agent → sources), still posted in the last 14 days: how many, and their typical asking price. */
  market: number; marketSale: number | null; marketRent: number | null; marketSaleN: number; marketRentN: number;
};

const MARKET_FRESH_DAYS = 14;

export async function marketData(days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [areaRows, openSearch, supply, recent, matchRows, outside, sourceRows] = await Promise.all([
    db.select().from(areas).where(eq(areas.active, true)),
    db.select({ id: requests.id, areaIds: requests.areaIds, subtype: requests.subtype, budgetMax: requests.budgetMax, propertyType: requests.propertyType,
      bedrooms: requests.bedroomsMin }).from(requests).where(and(eq(requests.kind, "search"), inArray(requests.status, [...OPEN_STATUSES]))),
    db.select({ areaId: properties.areaId, purpose: properties.purpose, salePrice: properties.salePrice, rentPrice: properties.rentPrice, kind: properties.kind })
      .from(properties).where(eq(properties.status, "available")),
    db.select({ kind: requests.kind, status: requests.status, source: requests.sourceChannel, utm: requests.attribution, createdAt: requests.createdAt })
      .from(requests).where(gte(requests.createdAt, since)),
    db.select({ requestId: matches.requestId }).from(matches).where(inArray(matches.status, ["suggested", "approved", "sent"])),
    db.select({ areaId: marketListings.areaId, purpose: marketListings.purpose, price: marketListings.price }).from(marketListings)
      .where(gt(marketListings.lastSeenAt, new Date(Date.now() - MARKET_FRESH_DAYS * 86_400_000))),
    db.select({ active: agentSources.active, lastRunAt: agentSources.lastRunAt }).from(agentSources),
  ]);
  const matched = new Set(matchRows.map((m) => m.requestId));

  const stats: AreaStat[] = areaRows.map((a) => {
    const want = openSearch.filter((r) => r.areaIds.includes(a.id));
    const have = supply.filter((p) => p.areaId === a.id);
    const buy = want.filter((r) => r.subtype !== "Rent");
    const rent = want.filter((r) => r.subtype === "Rent");
    const forSale = have.filter((p) => p.purpose !== "rent");
    const forRent = have.filter((p) => p.purpose !== "sale");
    const ads = outside.filter((m) => m.areaId === a.id);
    const adsSale = ads.filter((m) => m.purpose === "sale" && m.price).map((m) => m.price!);
    const adsRent = ads.filter((m) => m.purpose === "rent" && m.price).map((m) => m.price!);
    return {
      id: a.id, nameAr: a.nameAr, nameEn: a.nameEn, lat: a.lat, lng: a.lng, boundary: a.boundary,
      demand: want.length, demandBuy: buy.length, demandRent: rent.length, unmet: want.filter((r) => !matched.has(r.id)).length,
      supply: have.length, supplyBuy: forSale.length, supplyRent: forRent.length,
      medianBudgetBuy: median(buy.map((r) => r.budgetMax ?? 0).filter(Boolean)), medianBudgetRent: median(rent.map((r) => r.budgetMax ?? 0).filter(Boolean)),
      medianPriceSale: median(forSale.map((p) => p.salePrice ?? 0).filter(Boolean)), medianRent: median(forRent.map((p) => p.rentPrice ?? 0).filter(Boolean)),
      gap: want.length - have.length,
      market: ads.length, marketSale: median(adsSale), marketRent: median(adsRent), marketSaleN: adsSale.length, marketRentN: adsRent.length,
    };
  }).sort((a, b) => b.demand - a.demand);

  // What people ask for (type + bedrooms) versus what we have.
  const typeDemand = new Map<string, number>();
  for (const r of openSearch) typeDemand.set(r.propertyType ?? "Other", (typeDemand.get(r.propertyType ?? "Other") ?? 0) + 1);
  const typeSupply = new Map<string, number>();
  for (const p of supply) typeSupply.set(p.kind, (typeSupply.get(p.kind) ?? 0) + 1);
  const types = [...new Set([...typeDemand.keys(), ...typeSupply.keys()])]
    .map((t) => ({ type: t, demand: typeDemand.get(t) ?? 0, supply: typeSupply.get(t) ?? 0 })).sort((a, b) => b.demand - a.demand);

  // Budget bands for buyers and renters (OMR).
  const bands = (rows: typeof openSearch, edges: number[]) => edges.map((low, i) => {
    const high = edges[i + 1];
    return { label: high ? `${low.toLocaleString("en")}–${high.toLocaleString("en")}` : `${low.toLocaleString("en")}+`,
      n: rows.filter((r) => (r.budgetMax ?? 0) >= low && (high == null || (r.budgetMax ?? 0) < high)).length };
  });
  const buyBands = bands(openSearch.filter((r) => r.subtype !== "Rent" && r.budgetMax), [0, 50_000, 100_000, 150_000, 250_000, 400_000]);
  const rentBands = bands(openSearch.filter((r) => r.subtype === "Rent" && r.budgetMax), [0, 250, 400, 600, 900, 1500]);

  // Sources: requests in the period and how many became deals.
  const sourceMap = new Map<string, { n: number; won: number }>();
  for (const r of recent) {
    const key = (r.utm as Record<string, string>)?.utm_source || r.source || "Direct";
    const s = sourceMap.get(key) ?? { n: 0, won: 0 };
    s.n++;
    if (r.status === "won") s.won++;
    sourceMap.set(key, s);
  }
  const sources = [...sourceMap.entries()].map(([source, s]) => ({ source, ...s, rate: s.n ? Math.round((s.won / s.n) * 100) : 0 }))
    .sort((a, b) => b.n - a.n).slice(0, 12);

  // Weekly trend (last 12 weeks), searchers vs owners.
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = Date.now() - (11 - i) * 7 * 86_400_000;
    return { start: end - 7 * 86_400_000, end, search: 0, listing: 0, consulting: 0 };
  });
  const trendRows = await db.select({ kind: requests.kind, createdAt: requests.createdAt }).from(requests)
    .where(gte(requests.createdAt, new Date(weeks[0].start)));
  for (const r of trendRows) {
    const w = weeks.find((x) => r.createdAt.getTime() >= x.start && r.createdAt.getTime() < x.end);
    if (w) w[r.kind]++;
  }
  return { stats, types, buyBands, rentBands, sources, weeks, totals: { openSearch: openSearch.length, unmet: openSearch.filter((r) => !matched.has(r.id)).length,
    supply: supply.length, market: outside.length, marketUnplaced: outside.filter((m) => !m.areaId).length },
    outsideSources: { active: sourceRows.filter((s) => s.active).length,
      lastRun: sourceRows.reduce<Date | null>((a, s) => (s.lastRunAt && (!a || s.lastRunAt > a) ? s.lastRunAt : a), null) } };
}
