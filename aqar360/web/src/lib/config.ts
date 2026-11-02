export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
export const gtmId = process.env.NEXT_PUBLIC_GTM_ID || "";
// Vector map style (MapLibre). OpenFreeMap needs no key; a production provider (e.g. MapTiler) is a customer input.
export const mapStyleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron";
export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

// Customer-provided contact details; empty values hide the related links (customer_inputs.md).
export const contact = {
  phone: process.env.NEXT_PUBLIC_CONTACT_PHONE || "",
  whatsapp: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "").replace(/[^\d]/g, ""),
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
  instagram: "", facebook: "", threads: "", // set in Admin → Settings → Website
};

export const companyName: Record<Locale, string> = {
  ar: process.env.NEXT_PUBLIC_COMPANY_NAME_AR || "عقار 360",
  en: process.env.NEXT_PUBLIC_COMPANY_NAME_EN || "Aqar 360",
};

export const dir = (lang: Locale) => (lang === "ar" ? "rtl" : "ltr");
