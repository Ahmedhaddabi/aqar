"use client";

import { useState } from "react";

import { loanFor } from "@/components/Calculators";

import type { Dictionary } from "@/i18n/dictionaries";
import type { MapListing } from "@/lib/content";

type T = Dictionary["pages"]["map"]["extras"];
type Fmt = { amount: (v: number) => string };

const median = (values: number[]) => {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length < 3) return null; // fewer than three says nothing about "typical"
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

/** The price that matters for this listing: rent when it is let (or the visitor looks at rentals), otherwise sale. */
export const listingPrice = (l: MapListing, purpose: "all" | "Sale" | "Rent") => {
  const rent = !!l.rent_price && (l.purpose === "Rent" || (l.purpose === "Sale or Rent" && purpose === "Rent"));
  return { rent, value: rent ? l.rent_price ?? null : l.sale_price ?? l.price_from ?? null };
};

/** How a property's price compares with similar ones (same area, type and sale/rent); null without 3 others to compare. */
export function priceBadge(l: MapListing, all: MapListing[], purpose: "all" | "Sale" | "Rent") {
  if (l.type !== "property") return null;
  const mine = listingPrice(l, purpose);
  if (!mine.value) return null;
  const others = all.filter((o) => o.id !== l.id && o.type === "property" && o.area === l.area && o.kind === l.kind)
    .map((o) => listingPrice(o, mine.rent ? "Rent" : "Sale")).filter((p) => p.rent === mine.rent && p.value).map((p) => p.value!);
  const typical = median(others);
  if (!typical) return null;
  const pct = Math.round(((mine.value - typical) / typical) * 100);
  return { pct, tone: pct <= -5 ? "low" : pct >= 5 ? "high" : "typical" } as const;
}

export function PriceBadge({ badge, t }: { badge: ReturnType<typeof priceBadge>; t: T }) {
  if (!badge) return null;
  const text = badge.tone === "typical" ? t.typicalPrice : (badge.tone === "low" ? t.belowTypical : t.aboveTypical).replace("{n}", String(Math.abs(badge.pct)));
  return <span className={`map-badge ${badge.tone}`} title={t.badgeHelp}>{text}</span>;
}

/** Typical prices and buyer interest in one area, from the public listings (only when there are enough of them). */
export function AreaInsights({ listings, demand, t, fmt, currency }: { listings: MapListing[]; demand?: "high" | "medium" | "low" | null; t: T; fmt: Fmt; currency: string }) {
  const props = listings.filter((l) => l.type === "property");
  const sale = median(props.map((l) => l.sale_price ?? 0));
  const rent = median(props.map((l) => (l.purpose !== "Sale" ? l.rent_price ?? 0 : 0)));
  const perSqm = median(props.filter((l) => l.sale_price && l.size_sqm).map((l) => l.sale_price! / l.size_sqm!));
  if (!sale && !rent && !perSqm && !demand) return null;
  return (
    <dl className="map-insights">
      {sale ? <><dt>{t.typicalSale}</dt><dd>{fmt.amount(sale)} {currency}</dd></> : null}
      {rent ? <><dt>{t.typicalRent}</dt><dd>{fmt.amount(rent)} {currency}</dd></> : null}
      {perSqm ? <><dt>{t.perSqm}</dt><dd>{fmt.amount(Math.round(perSqm))} {currency}</dd></> : null}
      {demand ? <><dt>{t.demand}</dt><dd className={`map-demand ${demand}`}>{t.demandLevels[demand]}</dd></> : null}
      <dd className="map-insights-note">{t.insightsNote}</dd>
    </dl>
  );
}

/** "What can I afford?": a monthly budget becomes a highest price (sale: loan at the calculator's rate + 20 % down). */
export function BudgetFilter({ t, fmt, currency, value, onChange }: { t: T; fmt: Fmt; currency: string;
  value: { monthly: number; maxSale: number } | null; onChange: (v: { monthly: number; maxSale: number } | null) => void }) {
  const [open, setOpen] = useState(false);
  const [monthly, setMonthly] = useState(value ? String(value.monthly) : "");
  const apply = () => {
    const m = Number(monthly);
    if (!(m > 0)) return onChange(null);
    onChange({ monthly: m, maxSale: Math.round(loanFor(m, 5.5, 25) / 0.8) });
    setOpen(false);
  };
  return (
    <div className="map-budget">
      <button type="button" className="tool" aria-expanded={open} onClick={() => setOpen(!open)}>
        💰 {value ? t.budgetActive.replace("{v}", fmt.amount(value.monthly)) : t.budget}</button>
      {open && (
        <div className="map-popover" role="dialog" aria-label={t.budget}>
          <label><span>{t.monthlyBudget}</span>
            <input type="number" inputMode="decimal" min={0} value={monthly} onChange={(e) => setMonthly(e.target.value)} dir="ltr" placeholder="800" /></label>
          {Number(monthly) > 0 && <p className="muted">{t.budgetMeans.replace("{rent}", fmt.amount(Number(monthly))).replace("{sale}",
            fmt.amount(Math.round(loanFor(Number(monthly), 5.5, 25) / 0.8)))} {currency}</p>}
          <small className="muted">{t.budgetAssumption}</small>
          <div className="actions">
            <button type="button" className="btn primary" onClick={apply}>{t.apply}</button>
            {value && <button type="button" className="btn secondary" onClick={() => { onChange(null); setMonthly(""); setOpen(false); }}>{t.clearBudget}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Up to three listings side by side. */
export function CompareTable({ items, t, fmt, currency, title, areaName, onRemove, onClose, all, purpose }: {
  items: MapListing[]; t: T; fmt: Fmt; currency: string; title: (l: MapListing) => string; areaName: (l: MapListing) => string;
  onRemove: (id: string) => void; onClose: () => void; all: MapListing[]; purpose: "all" | "Sale" | "Rent";
}) {
  const row = (label: string, value: (l: MapListing) => React.ReactNode) => (
    <tr><th scope="row">{label}</th>{items.map((l) => <td key={l.id}>{value(l) ?? "—"}</td>)}</tr>
  );
  const money = (v: number | null | undefined) => (v ? `${fmt.amount(v)} ${currency}` : null);
  return (
    <div className="map-compare" role="dialog" aria-label={t.compareTitle}>
      <div className="map-compare-head"><h2>{t.compareTitle}</h2><button type="button" className="tool" onClick={onClose}>✕</button></div>
      <div className="map-compare-scroll">
        <table>
          <thead><tr><th />{items.map((l) => (
            <th key={l.id} scope="col">{l.image && <img src={l.image} alt="" />}<span>{title(l)}</span>
              <button type="button" className="link" onClick={() => onRemove(l.id)}>{t.remove}</button></th>
          ))}</tr></thead>
          <tbody>
            {row(t.area, areaName)}
            {row(t.price, (l) => money(listingPrice(l, purpose).value))}
            {row(t.vsTypical, (l) => <PriceBadge badge={priceBadge(l, all, purpose)} t={t} />)}
            {row(t.bedrooms, (l) => l.bedrooms ?? null)}
            {row(t.bathrooms, (l) => l.bathrooms ?? null)}
            {row(t.size, (l) => (l.size_sqm ? `${fmt.amount(l.size_sqm)} m²` : null))}
            {row(t.perSqm, (l) => (l.size_sqm && l.sale_price ? money(Math.round(l.sale_price / l.size_sqm)) : null))}
            {row(t.plot, (l) => (l.plot ? `${fmt.amount(l.plot.area_sqm)} m²${l.plot.land_use ? ` · ${l.plot.land_use}` : ""}` : null))}
            {row(t.furnished, (l) => l.furnished ?? null)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
