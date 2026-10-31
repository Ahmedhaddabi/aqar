// Small display helpers for the admin (server-side).
import { type Dictionary, getDictionary, optionLabel } from "@/i18n/dictionaries";

import type { AdminLang } from "./i18n";

const locale = (lang: AdminLang) => (lang === "ar" ? "ar-OM-u-nu-latn" : "en-GB");

export function dateTime(value: Date | string | null | undefined, lang: AdminLang) {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Muscat" })
    .format(new Date(value));
}

export function dateOnly(value: Date | string | null | undefined, lang: AdminLang) {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: "medium", timeZone: "Asia/Muscat" }).format(new Date(value));
}

/** "3 hours ago", "2 days ago" in the staff member's language. */
export function ago(value: Date | string, lang: AdminLang) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  if (Math.abs(minutes) < 60 * 24) return rtf.format(-Math.round(minutes / 60), "hour");
  return rtf.format(-Math.round(minutes / 1440), "day");
}

export const money = (value: number | null | undefined, lang: AdminLang) =>
  value == null ? "" : `${new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 }).format(value)} ${lang === "ar" ? "ر.ع" : "OMR"}`;

export const whatsappLink = (phone: string | null) => (phone ? `https://wa.me/${phone.replace(/[^\d]/g, "")}` : null);

/** Website dictionary: reuses the form labels and option names customers saw. */
export const siteDict = (lang: AdminLang): Dictionary => getDictionary(lang);

// Extra form answers stored on a request → the label the customer saw on the website form.
const DETAIL_LABELS: Record<string, keyof Dictionary["form"]> = {
  strict_budget: "strictBudget", match_alerts: "matchAlerts", request_kind: "requestKind", company_name: "companyName",
  units_needed: "unitsNeeded", investment_goal: "investmentGoal", foreign_ownership_required: "foreignOwnership",
  location_details: "locationDetails", size_sqm: "size", bathrooms: "bathrooms", bedrooms: "bedrooms",
  property_condition: "condition", readiness: "readiness", asset_type: "assetType", requested_output: "requestedOutput",
  map_link: "mapLink", asking_price: "askingPrice", budget: "budget", expected_timeline: "expectedTimeline",
};
const SKIP = new Set(["accuracy_declaration", "description", "current_situation"]);

export function detailRows(details: Record<string, unknown>, lang: AdminLang, yes: string, no: string) {
  const dict = siteDict(lang);
  return Object.entries(details).filter(([key, value]) => !SKIP.has(key) && value !== null && value !== "" && DETAIL_LABELS[key])
    .map(([key, value]) => ({
      label: String(dict.form[DETAIL_LABELS[key]] ?? key),
      value: typeof value === "boolean" ? (value ? yes : no) : typeof value === "number" ? String(value) : optionLabel(dict, String(value)),
      link: key === "map_link" ? String(value) : null,
    }));
}
