// Admin listing queries: projects, stand-alone properties, units, photos, area choices.
import { and, asc, desc, eq, ilike, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { areas, images, projects, projectUnitTypes, properties } from "@/db/schema";

import type { AdminLang } from "./i18n";

export async function areaChoices(lang: AdminLang) {
  const rows = await db.select().from(areas).where(eq(areas.active, true)).orderBy(asc(areas.nameEn));
  return rows.map((a) => ({ id: a.id, name: lang === "ar" ? a.nameAr : a.nameEn }));
}

export async function listProjects(q?: string) {
  const term = q?.trim();
  return db.select({ project: projects, area: areas }).from(projects).leftJoin(areas, eq(projects.areaId, areas.id))
    .where(term ? or(ilike(projects.nameEn, `%${term}%`), ilike(projects.nameAr, `%${term}%`), ilike(projects.developer, `%${term}%`)) : undefined)
    .orderBy(desc(projects.updatedAt));
}

export async function listProperties(q?: string) {
  const term = q?.trim();
  return db.select({ property: properties, area: areas }).from(properties).leftJoin(areas, eq(properties.areaId, areas.id))
    .where(and(isNull(properties.projectId), term ? or(ilike(properties.code, `%${term}%`), ilike(properties.title, `%${term}%`),
      ilike(properties.ownerName, `%${term}%`)) : undefined))
    .orderBy(desc(properties.updatedAt));
}

export async function photosOf(ownerType: "project" | "property", ownerId: number) {
  return db.select().from(images).where(and(eq(images.ownerType, ownerType), eq(images.ownerId, ownerId))).orderBy(asc(images.sort));
}

export async function getProjectForEdit(id: number) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return null;
  const [types, units, photos] = await Promise.all([
    db.select().from(projectUnitTypes).where(eq(projectUnitTypes.projectId, id)).orderBy(asc(projectUnitTypes.sort)),
    db.select().from(properties).where(eq(properties.projectId, id)).orderBy(asc(properties.unitNumber)),
    photosOf("project", id),
  ]);
  return { project, types, units, photos };
}

export async function getPropertyForEdit(id: number) {
  const [property] = await db.select().from(properties).where(eq(properties.id, id));
  if (!property || property.projectId) return null;
  return { property, photos: await photosOf("property", id) };
}
