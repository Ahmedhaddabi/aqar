import type { MetadataRoute } from "next";

import { locales, siteUrl } from "@/lib/config";
import { getSitemapEntries } from "@/lib/content";

// Public, indexable pages only; private pages (my-request) and unapproved policies are excluded (§15.4).
const STATIC = ["", "/find-me-a-property", "/market-my-property", "/market-my-project", "/content-services",
  "/consulting", "/map", "/projects", "/areas", "/insights", "/careers", "/partners-suppliers", "/about", "/contact"];

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entry = (path: string, lastModified?: string) => ({
    url: `${siteUrl}/ar${path}`,
    lastModified: lastModified ? new Date(lastModified) : undefined,
    alternates: { languages: Object.fromEntries(locales.map((l) => [l, `${siteUrl}/${l}${path}`])) },
  });
  const content = (await getSitemapEntries()).map((p) => entry(`/${p.section}/${p.slug}`, p.modified));
  return [...STATIC.map((path) => entry(path)), ...content];
}
