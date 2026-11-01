// Cached public content from the database (lib/public-data.ts). Failures fall back to empty content, never cached.
import { unstable_cache } from "next/cache";

import { contact, type Locale } from "./config";
import { formConfig } from "./intake";
import * as data from "./public-data";

export type PageCard = { slug: string; page_type: string; title: string; summary: string; area: string | null; last_reviewed: string | null };
export type ContentPage = Omit<PageCard, "area"> & {
  facts: { label: string; value: string }[];
  body: string;
  faqs: { question: string; answer: string }[];
  sources: string | null;
  seo_title: string;
  meta_description: string;
  modified: string;
  area: { name: string; slug: string } | null;
};
export type Area = { id: string; name: string; slug: string; wilayat: string | null; guide_slug: string | null };
export type Service = { code: string; name: string; scope: string; price: number | null; currency: string };
export type Job = {
  name: string; id: number; job_title: string; designation?: string; description: string;
  closes_on: string | null; posted_on: string | null; location?: string; employment_type?: string;
};
export type Policy = { policy_type: string; available: boolean; version?: string; effective_from?: string; body?: string };
export type FormConfig = {
  areas: { id: string; name: string; wilayat: string }[];
  options: Record<string, Record<string, string[]>>;
  terms: { privacy_policy: string | null; marketing_consent: string | null };
  captcha_required: boolean;
};

const REVALIDATE = 300;

function cached<A extends unknown[], T>(name: string, fn: (...args: A) => Promise<T>, revalidate = REVALIDATE) {
  return (...args: A) => unstable_cache(() => fn(...args), [name, JSON.stringify(args)],
    { revalidate, tags: ["aqar-content"] })();
}

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return (await promise) ?? fallback;
  } catch (error) {
    const cause = (error as { cause?: { message?: string; code?: string } }).cause;
    console.error("content unavailable:", cause ? `${cause.code ?? ""} ${cause.message ?? ""}` : (error as Error).message);
    return fallback;
  }
}

const pagesCached = cached("pages", data.listPages);
const pageCached = cached("page", data.getPage);
const areasCached = cached("areas", data.listAreas);
const servicesCached = cached("services", data.listServices);
const sitemapCached = cached("sitemap", data.sitemapEntries);
const mapCached = cached("map", data.getMapData);
const projectsCached = cached("projects", data.listProjects);
const projectCached = cached("project", data.getProject);

export const getPages = (lang: Locale, pageType?: string) => safe(pagesCached(lang, pageType), []);
export const getPage = (lang: Locale, slug: string) => safe(pageCached(lang, slug), null);
export const getAreas = (lang: Locale) => safe(areasCached(lang), []);
export const getServices = (lang: Locale) => safe(servicesCached(lang), []);
const jobsCached = cached("jobs", data.listJobs);
export const getJobs = (lang: Locale) => safe(jobsCached(lang), []);
const contactCached = cached("contact", data.siteContact);
export const getContact = () => safe(contactCached(), contact);
/** Legal texts are not approved yet: the legal pages say they are being prepared. */
export const getPolicy = async (_lang: Locale, _slug: string): Promise<Policy | null> => null;
export const getSitemapEntries = () => safe(sitemapCached(), []);
const formConfigCached = cached("form-config", formConfig);
/** Areas and option lists for the website forms; null only when the database is unavailable. */
export const getFormConfig = (lang: Locale) => safe<FormConfig | null>(formConfigCached(lang), null);

export type Point = [number, number];
export type MapArea = {
  id: string; name: string; slug: string; wilayat: string | null; guide_slug: string | null;
  center: Point | null; boundary: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  /** How many people are searching there, as a level only (open search requests). */
  demand?: "high" | "medium" | "low" | null;
};
export type MapUnit = {
  type: string; bedrooms: number | null; size_from: number | null; size_to: number | null;
  price_from: number | null; price_to: number | null; available: string | null;
};
export type MapListing = {
  id: string; slug?: string | null; type: "project" | "property"; kind: string; title: string | null; area: string | null;
  purpose: "Sale" | "Rent" | "Sale or Rent"; image: string | null; point: Point | null; exact: boolean;
  sale_price?: number | null; rent_price?: number | null; price_from?: number | null; price_to?: number | null;
  bedrooms?: number | null; bathrooms?: number | null; size_sqm?: number | null; furnished?: string | null;
  construction_status?: string | null; handover?: string | null; payment_plan?: string | null; summary?: string | null;
  available_units?: number | null; developer?: string | null; category?: string | null; units?: MapUnit[];
  /** Plot outline from the croquis, only when staff chose to show it publicly. */
  plot?: { polygon: Point[]; area_sqm: number; land_use: string | null } | null;
};
export type MapData = { areas: MapArea[]; listings: MapListing[] };

export const getMapData = (lang: Locale) => safe(mapCached(lang), null);

export type ProjectCard = MapListing & { area_name: string | null };
export type ProjectUnit = {
  number: string; floor: number | null; type: string | null; bedrooms: number | null; size: number | null;
  price: number | null; purpose: "Sale" | "Rent"; state: "available" | "reserved" | "sold";
};
export type ProjectPage = Omit<MapListing, "area"> & {
  description: string; gallery: { image: string; caption: string | null }[]; unit_list: ProjectUnit[];
  brochure: string | null; foreign_ownership_eligible: boolean; modified: string;
  area: { id: string; name: string; slug: string; wilayat: string | null; guide_slug: string | null } | null;
};

export const getProjects = (lang: Locale) => safe(projectsCached(lang), []);
export const getProject = (lang: Locale, slug: string) => safe(projectCached(lang, slug), null);
