// Number, plural and link helpers shared by the map and project pages (Arabic uses Latin digits, as in Oman).
import type { Dictionary, Plural } from "@/i18n/dictionaries";

import type { Locale } from "./config";

export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));

export function formatters(lang: Locale) {
  const locale = lang === "ar" ? "ar-OM-u-nu-latn" : "en-OM";
  const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const plurals = new Intl.PluralRules(lang);
  return {
    amount: (n: number) => amount.format(n),
    compact: (n: number) => compact.format(n),
    count: (forms: Plural, n: number) => fill(forms[plurals.select(n)] ?? forms.other, { n }),
  };
}

/** "2 bedrooms" when the unit type has a bedroom count, otherwise the translated type name. */
export function unitTypeLabel(dict: Dictionary, lang: Locale, type: string, bedrooms?: number | null) {
  const t = dict.pages.map;
  const n = bedrooms ?? Number(/^(\d)\+?\s*Bedroom/i.exec(type)?.[1] ?? NaN);
  return Number.isFinite(n) && n > 0 ? formatters(lang).count(t.bedroomsCount, n) : t.unitTypes[type] || type;
}

/** The request form pre-filled from a listing (purpose, type, area, budget and a note naming it). The listing itself
 * travels as interest_* fields and is stored on the request in the CRM (validated there: public listings only). */
export function interestHref(lang: Locale, values: { rent?: boolean; kind: string; area?: string | null;
  budget?: number | null; note: string; listing?: { type: "project" | "property"; id: string; unit?: string };
  source?: string }) {
  const query = new URLSearchParams({ purpose: values.rent ? "Rent" : "Buy", property_type: values.kind, notes: values.note });
  if (values.listing) {
    query.set("interest_type", values.listing.type);
    query.set("interest_id", values.listing.id);
    if (values.listing.unit) query.set("interest_unit", values.listing.unit);
  }
  if (values.source) query.set("source_page", values.source);
  if (values.area) query.set("areas", values.area);
  if (values.budget) query.set("budget_max", String(Math.round(values.budget)));
  return `/${lang}/find-me-a-property?${query}`;
}

let loading: Promise<typeof import("maplibre-gl")> | null = null;

/** MapLibre on demand; its worker is served from our own origin (scripts/copy-map-worker.mjs, CSP worker-src). */
export function loadMapLibre() {
  loading ??= import("maplibre-gl").then((ml) => {
    ml.setWorkerUrl(`/vendor/maplibre-gl-worker-${ml.getVersion()}.mjs`);
    return ml;
  });
  return loading;
}
