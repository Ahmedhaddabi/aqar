// Cached public content from Frappe. Failures are thrown inside the cache so errors are never cached.
import { unstable_cache } from "next/cache";

import type { Locale } from "./config";
import { frappeCall } from "./frappe";

export type PageCard = { slug: string; page_type: string; title: string; summary: string; area: string | null; last_reviewed: string | null };
export type ContentPage = PageCard & {
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
  name: string; job_title: string; designation?: string; description: string;
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

async function load<T>(method: string, params: Record<string, string>): Promise<T> {
  const res = await frappeCall<T>(method, { params });
  if (res.ok) return res.data;
  if (res.error.code === "not_found") return null as T;
  throw new Error(`${method}: ${res.error.code}`);
}

function cached<T>(method: string, params: Record<string, string>, revalidate = REVALIDATE) {
  const key = `${method}:${JSON.stringify(params)}`;
  return unstable_cache(() => load<T>(method, params), [key], { revalidate, tags: ["aqar-content"] })();
}

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return (await promise) ?? fallback;
  } catch {
    return fallback;
  }
}

export const getPages = (lang: Locale, pageType?: string) =>
  safe(cached<PageCard[]>("content.list_pages", { language: lang, ...(pageType ? { page_type: pageType } : {}) }), []);
export const getPage = (lang: Locale, slug: string) =>
  safe(cached<ContentPage | null>("content.get_page", { language: lang, slug }), null);
export const getAreas = (lang: Locale) => safe(cached<Area[]>("content.list_areas", { language: lang }), []);
export const getServices = (lang: Locale) => safe(cached<Service[]>("content.list_services", { language: lang }), []);
export const getJobs = (lang: Locale) => safe(cached<Job[]>("content.list_jobs", { language: lang }), []);
export const getPolicy = (lang: Locale, slug: string) =>
  safe(cached<Policy | null>("content.get_policy", { language: lang, slug }), null);
export const getSitemapEntries = () =>
  safe(cached<{ slug: string; section: string; modified: string }[]>("content.sitemap_entries", {}), []);
/** null when the public forms are switched off (feature flag) or the backend is unavailable. */
export const getFormConfig = (lang: Locale) =>
  safe(cached<FormConfig | null>("public.get_form_config", { language: lang }, 60), null);

export type Point = [number, number];
export type MapArea = {
  id: string; name: string; slug: string; wilayat: string | null; guide_slug: string | null;
  center: Point | null; boundary: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
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
};
export type MapData = { areas: MapArea[]; listings: MapListing[] };

export const getMapData = (lang: Locale) =>
  safe(cached<MapData | null>("content.get_map_data", { language: lang }), null);

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

export const getProjects = (lang: Locale) => safe(cached<ProjectCard[]>("content.list_projects", { language: lang }), []);
export const getProject = (lang: Locale, slug: string) =>
  safe(cached<ProjectPage | null>("content.get_project", { language: lang, slug }), null);
