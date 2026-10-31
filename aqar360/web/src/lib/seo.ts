import type { Metadata } from "next";

import { companyName, contact, type Locale, siteUrl } from "./config";

/** Canonical + hreflang alternates for a path that exists in both languages (§3.3, §15.4). */
export function pageMetadata(
  lang: Locale,
  path: string,
  title: string,
  description: string,
  options: { noindex?: boolean } = {},
): Metadata {
  const url = `/${lang}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url, languages: { ar: `/ar${path}`, en: `/en${path}`, "x-default": `/ar${path}` } },
    openGraph: { title, description, url, siteName: companyName[lang], locale: lang === "ar" ? "ar_OM" : "en_OM", type: "website" },
    robots: options.noindex ? { index: false, follow: false } : undefined,
  };
}

const absolute = (path: string) => new URL(path, siteUrl).toString();

/** ProfessionalService, not RealEstateAgent, unless the company is licensed as such (§15.3). */
export function organizationLd(lang: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: companyName[lang],
    url: absolute(`/${lang}`),
    areaServed: { "@type": "Country", name: "Oman" },
    ...(contact.phone ? { telephone: contact.phone } : {}),
    ...(contact.email ? { email: contact.email } : {}),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: absolute(item.path) })),
  };
}

export function articleLd(lang: Locale, path: string, title: string, description: string, modified: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    inLanguage: lang,
    dateModified: modified,
    mainEntityOfPage: absolute(path),
    publisher: { "@type": "Organization", name: companyName[lang] },
  };
}

export function faqLd(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  };
}

/** A developer project as a Place (location, image); prices and availability stay on the page, not in markup. */
export function placeLd(path: string, name: string, description: string, area?: string | null,
  point?: [number, number] | null, image?: string | null) {
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name,
    ...(description ? { description } : {}),
    url: absolute(path),
    address: { "@type": "PostalAddress", ...(area ? { addressLocality: area } : {}), addressCountry: "OM" },
    ...(point ? { geo: { "@type": "GeoCoordinates", latitude: point[1], longitude: point[0] } } : {}),
    ...(image ? { image: absolute(image) } : {}),
  };
}
