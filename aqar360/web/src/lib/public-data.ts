// Public website data straight from the database. Only published / public + verified + available records.
import { and, asc, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { areas, images, jobs, pages, projects, projectUnitTypes, properties, services, settings, wilayats } from "@/db/schema";

import { contact as envContact, type Locale } from "./config";
import type {
  Area, ContentPage, Job, MapArea, MapData, MapListing, PageCard, Point, ProjectCard, ProjectPage, ProjectUnit, Service,
} from "./content";

const OPEN = ["active", "limited"] as const;
const pick = (lang: Locale, ar: string | null | undefined, en: string | null | undefined) =>
  (lang === "ar" ? ar || en : en || ar) || "";
const point = (lat: number | null, lng: number | null): Point | null => (lat || lng ? [lng ?? 0, lat ?? 0] : null);
const excerpt = (html: string, limit = 400) => {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, limit).replace(/\s+\S*$/, "")}…`;
};
const facts = (text: string) => text.split("\n").map((line) => line.split(/:(.*)/s))
  .filter(([label, value]) => label?.trim() && value?.trim()).map(([label, value]) => ({ label: label.trim(), value: value.trim() }));

async function areaRows() {
  return db.select({ area: areas, wilayat: wilayats }).from(areas).leftJoin(wilayats, eq(areas.wilayatId, wilayats.id))
    .where(eq(areas.active, true)).orderBy(asc(areas.nameEn));
}

async function guideSlugs() {
  const rows = await db.select({ areaId: pages.areaId, slug: pages.slug }).from(pages)
    .where(and(eq(pages.published, true), eq(pages.type, "Area Guide")));
  return new Map(rows.map((r) => [r.areaId, r.slug]));
}

// ---- Content -----------------------------------------------------------------------------------------------------
export async function listAreas(lang: Locale): Promise<Area[]> {
  const [rows, guides] = await Promise.all([areaRows(), guideSlugs()]);
  return rows.map(({ area, wilayat }) => ({ id: String(area.id), name: pick(lang, area.nameAr, area.nameEn), slug: area.slug,
    wilayat: wilayat ? pick(lang, wilayat.nameAr, wilayat.nameEn) : null, guide_slug: guides.get(area.id) ?? null }));
}

export async function listPages(lang: Locale, pageType?: string): Promise<PageCard[]> {
  const rows = await db.select({ page: pages, area: areas }).from(pages).leftJoin(areas, eq(pages.areaId, areas.id))
    .where(and(eq(pages.published, true), pageType ? eq(pages.type, pageType) : undefined)).orderBy(asc(pages.titleEn));
  return rows.map(({ page, area }) => ({ slug: page.slug, page_type: page.type, title: pick(lang, page.titleAr, page.titleEn),
    summary: pick(lang, page.summaryAr, page.summaryEn), area: area ? pick(lang, area.nameAr, area.nameEn) : null,
    last_reviewed: page.lastReviewed }));
}

export async function getPage(lang: Locale, slug: string): Promise<ContentPage | null> {
  const [row] = await db.select({ page: pages, area: areas }).from(pages).leftJoin(areas, eq(pages.areaId, areas.id))
    .where(and(eq(pages.slug, slug), eq(pages.published, true)));
  if (!row) return null;
  const { page, area } = row;
  const title = pick(lang, page.titleAr, page.titleEn);
  const summary = pick(lang, page.summaryAr, page.summaryEn);
  return {
    slug: page.slug, page_type: page.type, title, summary, last_reviewed: page.lastReviewed,
    facts: facts(lang === "ar" ? page.factsAr || page.factsEn : page.factsEn || page.factsAr),
    body: pick(lang, page.bodyAr, page.bodyEn),
    faqs: page.faqs.map((f) => ({ question: pick(lang, f.questionAr, f.questionEn), answer: pick(lang, f.answerAr, f.answerEn) })),
    sources: page.type === "Market Insight" ? page.sources : null, seo_title: title, meta_description: summary,
    modified: page.updatedAt.toISOString(), area: area ? { name: pick(lang, area.nameAr, area.nameEn), slug: area.slug } : null,
  };
}

export async function listServices(lang: Locale): Promise<Service[]> {
  const rows = await db.select().from(services).where(eq(services.public, true)).orderBy(asc(services.sort));
  return rows.map((r) => ({ code: r.code, name: pick(lang, r.nameAr, r.nameEn), scope: pick(lang, r.scopeAr, r.scopeEn),
    price: r.price, currency: "OMR" }));
}

export async function sitemapEntries() {
  const [pageRows, projectRows] = await Promise.all([
    db.select({ slug: pages.slug, type: pages.type, modified: pages.updatedAt }).from(pages).where(eq(pages.published, true)),
    publicProjects(),
  ]);
  return [
    ...pageRows.map((p) => ({ slug: p.slug, section: p.type === "Area Guide" ? "areas" : "insights", modified: p.modified.toISOString() })),
    ...projectRows.map((p) => ({ slug: p.slug, section: "projects", modified: p.updatedAt.toISOString() })),
  ];
}

// ---- Listings ----------------------------------------------------------------------------------------------------
function publicProjects(slug?: string) {
  return db.select().from(projects).where(and(eq(projects.public, true), eq(projects.verified, true),
    inArray(projects.availability, [...OPEN]), slug ? eq(projects.slug, slug) : undefined)).orderBy(asc(projects.nameEn));
}

function unitState(status: string): ProjectUnit["state"] | null {
  if (status === "hidden") return null;
  if (status === "reserved") return "reserved";
  return status === "available" ? "available" : "sold";
}

type ProjectDetails = { types: Map<number, NonNullable<MapListing["units"]>>; units: Map<number, ProjectUnit[]> };

async function projectDetails(lang: Locale, ids: number[]): Promise<ProjectDetails> {
  if (!ids.length) return { types: new Map(), units: new Map() };
  const [typeRows, unitRows] = await Promise.all([
    db.select().from(projectUnitTypes).where(inArray(projectUnitTypes.projectId, ids)).orderBy(asc(projectUnitTypes.sort)),
    db.select().from(properties).where(inArray(properties.projectId, ids)).orderBy(asc(properties.unitNumber)),
  ]);
  const units = new Map<number, ProjectUnit[]>();
  for (const u of unitRows) {
    const state = unitState(u.status);
    if (!state || !u.projectId) continue;
    const rent = u.purpose === "rent";
    units.set(u.projectId, [...(units.get(u.projectId) ?? []), { number: u.unitNumber || u.code, floor: u.floor,
      type: u.unitType, bedrooms: u.bedrooms, size: u.sizeSqm, price: (rent ? u.rentPrice : u.salePrice) ?? null,
      purpose: rent ? "Rent" : "Sale", state }]);
  }
  const types = new Map<number, NonNullable<MapListing["units"]>>();
  for (const t of typeRows) {
    // Availability is counted live from unit records when the type has any; otherwise the typed number is used.
    const live = (units.get(t.projectId) ?? []).filter((u) => u.type === t.type);
    const available = live.length ? live.filter((u) => u.state === "available").length : t.available;
    types.set(t.projectId, [...(types.get(t.projectId) ?? []), { type: t.type, bedrooms: t.bedrooms, size_from: t.sizeFrom,
      size_to: t.sizeTo, price_from: t.priceFrom, price_to: t.priceTo, available: available == null ? null : String(available) }]);
  }
  return { types, units };
}

function projectCard(lang: Locale, p: typeof projects.$inferSelect, details: ProjectDetails): MapListing {
  const types = details.types.get(p.id) ?? [];
  const units = details.units.get(p.id) ?? [];
  const counts = types.filter((t) => t.available != null).map((t) => Number(t.available));
  if (!types.length && units.length) counts.push(units.filter((u) => u.state === "available").length);
  return {
    id: p.slug, slug: p.slug, type: "project", kind: "Project", category: p.category, title: pick(lang, p.nameAr, p.nameEn),
    developer: p.developer || null, area: p.areaId ? String(p.areaId) : null, purpose: "Sale",
    price_from: p.priceFrom, price_to: p.priceTo, construction_status: p.constructionStatus, handover: p.handover,
    payment_plan: pick(lang, p.paymentPlanAr, p.paymentPlanEn) || null,
    summary: excerpt(pick(lang, p.descriptionAr, p.descriptionEn)) || null,
    available_units: counts.length ? counts.reduce((a, b) => a + b, 0) : null, image: p.coverImage,
    point: point(p.lat, p.lng), exact: true, units: types,
  };
}

export async function listProjects(lang: Locale): Promise<ProjectCard[]> {
  const [rows, areaList] = await Promise.all([publicProjects(), listAreas(lang)]);
  const details = await projectDetails(lang, rows.map((p) => p.id));
  const names = new Map(areaList.map((a) => [a.id, a.name]));
  return rows.map((p) => {
    const card = projectCard(lang, p, details);
    return { ...card, area_name: card.area ? names.get(card.area) ?? null : null };
  });
}

export async function getProject(lang: Locale, slug: string): Promise<ProjectPage | null> {
  const [p] = await publicProjects(slug);
  if (!p) return null;
  const [details, areaList, gallery] = await Promise.all([projectDetails(lang, [p.id]), listAreas(lang),
    db.select().from(images).where(and(eq(images.ownerType, "project"), eq(images.ownerId, p.id))).orderBy(asc(images.sort))]);
  const card = projectCard(lang, p, details);
  const area = areaList.find((a) => a.id === card.area);
  return {
    ...card, description: pick(lang, p.descriptionAr, p.descriptionEn),
    gallery: [...(p.coverImage ? [{ image: p.coverImage, caption: null }] : []),
      ...gallery.filter((g) => g.url !== p.coverImage).map((g) => ({ image: g.url, caption: pick(lang, g.captionAr, g.captionEn) || null }))],
    unit_list: details.units.get(p.id) ?? [], brochure: p.brochure, foreign_ownership_eligible: p.foreignOwnership,
    modified: p.updatedAt.toISOString(),
    area: area ? { id: area.id, name: area.name, slug: area.slug, wilayat: area.wilayat, guide_slug: area.guide_slug } : null,
  };
}

export async function getMapData(lang: Locale): Promise<MapData> {
  const [areaList, guides, projectList, props] = await Promise.all([
    areaRows(), guideSlugs(), publicProjects(),
    // Stand-alone properties only; project units are shown on their project.
    db.select().from(properties).where(and(eq(properties.public, true), eq(properties.verified, true),
      eq(properties.status, "available"), isNull(properties.projectId))),
  ]);
  const details = await projectDetails(lang, projectList.map((p) => p.id));
  const mapAreas: MapArea[] = areaList.map(({ area, wilayat }) => ({ id: String(area.id), name: pick(lang, area.nameAr, area.nameEn),
    slug: area.slug, wilayat: wilayat ? pick(lang, wilayat.nameAr, wilayat.nameEn) : null, guide_slug: guides.get(area.id) ?? null,
    center: point(area.lat, area.lng), boundary: area.boundary ?? null }));
  const listings: MapListing[] = [
    ...projectList.map((p) => projectCard(lang, p, details)),
    // No owner names or internal titles; exact coordinates only with the owner's permission.
    ...props.map((p): MapListing => ({
      id: p.code, type: "property", kind: p.kind, title: null, area: p.areaId ? String(p.areaId) : null,
      purpose: p.purpose === "rent" ? "Rent" : p.purpose === "sale" ? "Sale" : "Sale or Rent",
      sale_price: p.salePrice, rent_price: p.rentPrice, bedrooms: p.bedrooms, bathrooms: p.bathrooms, size_sqm: p.sizeSqm,
      furnished: p.furnished, image: p.coverImage, exact: p.showExactLocation && !!point(p.lat, p.lng),
      point: p.showExactLocation ? point(p.lat, p.lng) : null,
    })),
  ];
  return { areas: mapAreas, listings };
}

// ---- Careers -----------------------------------------------------------------------------------------------------
/** Published vacancies that have not closed (Oman date). */
export async function listJobs(lang: Locale): Promise<Job[]> {
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  const rows = await db.select().from(jobs).where(and(eq(jobs.published, true), or(isNull(jobs.closesOn), gte(jobs.closesOn, today))))
    .orderBy(desc(jobs.createdAt));
  return rows.map((j) => ({ name: j.slug, id: j.id, job_title: pick(lang, j.titleAr, j.titleEn), description: pick(lang, j.descriptionAr, j.descriptionEn),
    closes_on: j.closesOn, posted_on: j.createdAt.toISOString().slice(0, 10), location: j.location, employment_type: j.employmentType }));
}

// ---- Contact -----------------------------------------------------------------------------------------------------
/** Contact buttons: Admin → Settings first, then the server's NEXT_PUBLIC_* values. */
export async function siteContact() {
  const rows = await db.select().from(settings).where(inArray(settings.key, ["contactPhone", "contactWhatsapp", "contactEmail"]));
  const get = (key: string) => String(rows.find((r) => r.key === key)?.value ?? "").trim();
  return { phone: get("contactPhone") || envContact.phone, whatsapp: get("contactWhatsapp").replace(/[^\d]/g, "") || envContact.whatsapp,
    email: get("contactEmail") || envContact.email };
}
