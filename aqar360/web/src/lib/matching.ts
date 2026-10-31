// Demand-to-supply matching (rules ported from the Frappe engine). Suggestions only: staff approve before the
// customer hears about anything. Re-running never overwrites a staff decision (approved, sent, rejected).
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { areas, matches, OPEN_STATUSES, projects, projectUnitTypes, properties, requests } from "@/db/schema";

const MIN_SCORE = 50;
const URGENT = ["Immediately", "Within 1 Month"];
const COMPATIBLE: Record<string, string[]> = {
  Commercial: ["Shop", "Office", "Showroom", "Warehouse"], Shop: ["Showroom", "Commercial"], Showroom: ["Shop", "Commercial"],
  Office: ["Commercial"], Building: ["Apartment"],
};
const UNIT_KIND: Record<string, string> = { Office: "Office", Shop: "Shop", Showroom: "Showroom", Warehouse: "Warehouse",
  "Land Plot": "Land", Villa: "Villa", Townhouse: "Villa" };

type Supply = {
  key: string; propertyId: number | null; unitTypeId: number | null; projectId: number | null; kind: string;
  sale: number | null; rent: number | null; purpose: "sale" | "rent" | "sale_or_rent"; areaId: number | null;
  bedrooms: number | null; size: number | null; construction: string | null; verified: boolean;
};
type Req = typeof requests.$inferSelect;
export type MatchResult = { score: number; matchType: "within" | "near" | "interest"; price: number | null; reasons: string[]; warnings: string[] };

/** Everything that can be offered: available properties and units, plus unit types of projects without unit records. */
async function loadSupply(filter?: { propertyIds?: number[]; projectIds?: number[] }): Promise<Supply[]> {
  const projectRows = await db.select().from(projects).where(and(inArray(projects.availability, ["active", "limited"]),
    filter?.projectIds ? inArray(projects.id, filter.projectIds) : undefined));
  const projectById = new Map(projectRows.map((p) => [p.id, p]));
  const propertyRows = filter?.projectIds && !filter.propertyIds
    ? await db.select().from(properties).where(and(eq(properties.status, "available"), inArray(properties.projectId, filter.projectIds)))
    : await db.select().from(properties).where(and(eq(properties.status, "available"),
      filter?.propertyIds ? inArray(properties.id, filter.propertyIds) : undefined));
  const items: Supply[] = propertyRows
    .filter((p) => !p.projectId || projectById.has(p.projectId) || filter?.propertyIds)
    .map((p) => ({ key: `p${p.id}`, propertyId: p.id, unitTypeId: null, projectId: p.projectId, kind: p.kind, sale: p.salePrice,
      rent: p.rentPrice, purpose: p.purpose, areaId: p.areaId, bedrooms: p.bedrooms, size: p.sizeSqm,
      construction: p.projectId ? projectById.get(p.projectId)?.constructionStatus ?? null : null, verified: p.verified }));
  const withUnits = new Set(propertyRows.filter((p) => p.projectId).map((p) => p.projectId));
  const typeProjects = projectRows.filter((p) => !withUnits.has(p.id));
  if (typeProjects.length && !filter?.propertyIds) {
    const types = await db.select().from(projectUnitTypes).where(inArray(projectUnitTypes.projectId, typeProjects.map((p) => p.id)));
    for (const t of types) {
      const p = projectById.get(t.projectId)!;
      items.push({ key: `t${t.id}`, propertyId: null, unitTypeId: t.id, projectId: p.id, kind: UNIT_KIND[t.type] ?? "Apartment",
        sale: t.priceFrom, rent: null, purpose: "sale", areaId: p.areaId, bedrooms: t.bedrooms, size: t.sizeFrom,
        construction: p.constructionStatus, verified: p.verified });
    }
  }
  return items;
}

async function wilayatOf() {
  const rows = await db.select({ id: areas.id, w: areas.wilayatId }).from(areas);
  return new Map(rows.map((r) => [r.id, r.w]));
}

function asked(req: Req, item: Supply) {
  if (req.interestPropertyId && item.propertyId === req.interestPropertyId) return "exact";
  if (!req.interestPropertyId && req.interestProjectId && item.projectId === req.interestProjectId) return "project";
  return null;
}

export function evaluate(req: Req, item: Supply, wilayats: Map<number, number | null>): MatchResult | null {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const rent = req.subtype === "Rent";
  const price = rent ? item.rent : item.sale;
  const purposeOk = rent ? item.purpose !== "sale" : item.purpose !== "rent";
  const interest = asked(req, item);
  const score = (() => {
    if (!purposeOk || !price || !req.budgetMax) return null;
    let total = 0;
    // Location
    if (!req.areaIds.length) total += 10;
    else if (item.areaId && req.areaIds.includes(item.areaId)) { total += 25; reasons.push("in_area"); }
    else if (item.areaId && req.areaIds.some((a) => wilayats.get(a) && wilayats.get(a) === wilayats.get(item.areaId!))) {
      total += 10; reasons.push("same_wilayat");
    } else return null;
    // Type
    const wanted = req.propertyType ?? "Other";
    if (wanted === "Project" ? item.projectId : wanted === item.kind) { total += 20; reasons.push("type_match"); }
    else if (wanted === "Other" || COMPATIBLE[wanted]?.includes(item.kind)) { total += 10; reasons.push("related_type"); }
    else return null;
    // Budget: at or below always fits; above only within the tolerance (20% unless the customer asked for strict)
    const tolerance = req.details?.strict_budget ? 0 : 20;
    if (price <= req.budgetMax) { total += 35; reasons.push("within_budget"); }
    else if (price <= req.budgetMax * (1 + tolerance / 100)) {
      total += 15; warnings.push(`over_budget:${Math.round(((price - req.budgetMax) / req.budgetMax) * 1000) / 10}`);
    } else return null;
    // Rooms
    if (!req.bedroomsMin) total += 10;
    else if (item.bedrooms == null) { total += 5; warnings.push("rooms_unknown"); }
    else if (item.bedrooms >= req.bedroomsMin) { total += 10; reasons.push(`rooms:${item.bedrooms}`); }
    else { total += item.bedrooms === req.bedroomsMin - 1 ? 4 : 0; warnings.push(`fewer_rooms:${item.bedrooms}/${req.bedroomsMin}`); }
    // Readiness
    if (req.timing && URGENT.includes(req.timing) && ["Pre-Launch", "Under Construction"].includes(item.construction ?? "")) {
      warnings.push("not_ready");
    } else total += 5;
    if (!item.verified) warnings.push("not_verified");
    return total >= MIN_SCORE ? total : null;
  })();
  if (score != null) {
    if (interest) reasons.unshift("asked");
    return { score, matchType: warnings.some((w) => w.startsWith("over_budget")) ? "near" : "within", price, reasons, warnings };
  }
  // The exact unit/property the customer chose stays visible to staff even when outside the request's criteria.
  if (interest === "exact") {
    return { score: 0, matchType: "interest", price: price ?? item.sale ?? item.rent, reasons: ["asked"], warnings: ["outside_criteria"] };
  }
  return null;
}

async function save(req: Req, item: Supply, result: MatchResult) {
  await db.insert(matches).values({ requestId: req.id, propertyId: item.propertyId, unitTypeId: item.unitTypeId,
    key: `${req.id}:${item.key}`, ...result })
    .onConflictDoUpdate({ target: matches.key, set: { score: result.score, matchType: result.matchType, price: result.price,
      reasons: result.reasons, warnings: result.warnings, updatedAt: new Date(),
      // A suggestion that was withdrawn comes back; staff decisions stay as they are.
      status: sql`case when ${matches.status} = 'withdrawn' then 'suggested' else ${matches.status} end` } });
}

/** Re-match one search request against all supply. Returns the number of open suggestions. */
export async function matchRequest(requestId: number) {
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!req || req.kind !== "search") return 0;
  if (!(OPEN_STATUSES as readonly string[]).includes(req.status)) {
    await db.update(matches).set({ status: "withdrawn", updatedAt: new Date() })
      .where(and(eq(matches.requestId, req.id), eq(matches.status, "suggested")));
    return 0;
  }
  const [supply, wilayats] = await Promise.all([loadSupply(), wilayatOf()]);
  const keys: string[] = [];
  for (const item of supply) {
    const result = evaluate(req, item, wilayats);
    if (result) { await save(req, item, result); keys.push(`${req.id}:${item.key}`); }
  }
  await db.update(matches).set({ status: "withdrawn", updatedAt: new Date() }).where(and(eq(matches.requestId, req.id),
    eq(matches.status, "suggested"), keys.length ? notInArray(matches.key, keys) : undefined));
  return keys.length;
}

/** After a listing changes: re-check it against every open search request. */
export async function matchSupply(filter: { propertyIds?: number[]; projectIds?: number[] }) {
  const [supply, wilayats, open] = await Promise.all([loadSupply(filter), wilayatOf(),
    db.select().from(requests).where(and(eq(requests.kind, "search"), inArray(requests.status, [...OPEN_STATUSES])))]);
  const fitting = new Set<string>();
  for (const req of open) {
    for (const item of supply) {
      const result = evaluate(req, item, wilayats);
      if (result) { await save(req, item, result); fitting.add(`${req.id}:${item.key}`); }
    }
  }
  // Suggestions for this listing that no longer fit (sold, price changed, hidden…) are withdrawn.
  const scope = filter.propertyIds ? inArray(matches.propertyId, filter.propertyIds)
    : sql`(${matches.propertyId} in (select id from properties where project_id in ${filter.projectIds!})
      or ${matches.unitTypeId} in (select id from project_unit_types where project_id in ${filter.projectIds!}))`;
  const stale = await db.select({ id: matches.id, key: matches.key }).from(matches).where(and(eq(matches.status, "suggested"), scope));
  const gone = stale.filter((m) => !fitting.has(m.key)).map((m) => m.id);
  if (gone.length) await db.update(matches).set({ status: "withdrawn", updatedAt: new Date() }).where(inArray(matches.id, gone));
}

