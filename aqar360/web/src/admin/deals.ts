// Matches, viewings and offers for one request (admin).
import { and, count, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { areas, matches, offers, projects, projectUnitTypes, properties } from "@/db/schema";

export type MatchRow = Awaited<ReturnType<typeof matchesFor>>[number];

export async function matchesFor(requestId: number) {
  const rows = await db.select({ match: matches, property: properties, unitType: projectUnitTypes }).from(matches)
    .leftJoin(properties, eq(matches.propertyId, properties.id)).leftJoin(projectUnitTypes, eq(matches.unitTypeId, projectUnitTypes.id))
    .where(eq(matches.requestId, requestId)).orderBy(desc(matches.score));
  const projectIds = [...new Set(rows.map((r) => r.property?.projectId ?? r.unitType?.projectId).filter((v): v is number => !!v))];
  const areaIds = [...new Set(rows.map((r) => r.property?.areaId).filter((v): v is number => !!v))];
  const [projectRows, areaRows] = await Promise.all([
    projectIds.length ? db.select().from(projects).where(inArray(projects.id, projectIds)) : Promise.resolve([]),
    areaIds.length ? db.select().from(areas).where(inArray(areas.id, areaIds)) : Promise.resolve([]),
  ]);
  const project = new Map(projectRows.map((p) => [p.id, p]));
  const area = new Map(areaRows.map((a) => [a.id, a]));
  return rows.map((r) => {
    const proj = project.get(r.property?.projectId ?? r.unitType?.projectId ?? 0);
    return { ...r, project: proj ?? null, area: area.get(r.property?.areaId ?? proj?.areaId ?? 0) ?? null };
  });
}

export async function offersFor(requestId: number) {
  return db.select({ offer: offers, property: properties }).from(offers).leftJoin(properties, eq(offers.propertyId, properties.id))
    .where(eq(offers.requestId, requestId)).orderBy(desc(offers.createdAt));
}

export async function suggestionsToReview(requestIds?: number[]) {
  const [row] = await db.select({ n: count() }).from(matches).where(and(eq(matches.status, "suggested"),
    requestIds ? inArray(matches.requestId, requestIds.length ? requestIds : [0]) : undefined));
  return row.n;
}
