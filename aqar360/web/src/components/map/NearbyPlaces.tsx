"use client";

import { useEffect, useMemo, useState } from "react";

import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";
import type { Point } from "@/lib/content";
import { distanceM } from "@/lib/geo";
import type { NearbyCategory, NearbyPlace } from "@/lib/nearby";

type T = Dictionary["pages"]["map"]["nearby"];
export const NEARBY_ICONS: Record<NearbyCategory, string> = { school: "🏫", health: "🏥", pharmacy: "💊", shop: "🛒", mosque: "🕌", park: "🌳", beach: "🏖" };
const ORDER: NearbyCategory[] = ["school", "health", "shop", "mosque", "pharmacy", "park", "beach"];

/** What is around a listing, closest first per kind, from OpenStreetMap. Distances are straight lines. */
export function NearbyPlaces({ lang, t, from, exact, onShow }: { lang: Locale; t: T; from: Point; exact: boolean; onShow: (places: NearbyPlace[] | null) => void }) {
  const [places, setPlaces] = useState<NearbyPlace[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState<NearbyCategory | null>(null);

  useEffect(() => {
    let alive = true;
    setState("loading");
    setShown(false);
    onShow(null);
    fetch(`/api/nearby?lat=${from[1].toFixed(5)}&lng=${from[0].toFixed(5)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j?.ok || j.data.unavailable) return setState("unavailable");
        setPlaces(j.data.places);
        setState("ready");
      })
      .catch(() => alive && setState("unavailable"));
    return () => { alive = false; };
  }, [from[0], from[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const withDistance = (places ?? []).map((p) => ({ ...p, d: distanceM(from, [p.lng, p.lat]) })).filter((p) => p.d <= 8000);
    return ORDER.map((cat) => ({ cat, items: withDistance.filter((p) => p.cat === cat).sort((a, b) => a.d - b.d) })).filter((g) => g.items.length);
  }, [places, from]);
  const km = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} ${t.m}` : `${(m / 1000).toFixed(1)} ${t.km}`);
  const nameOf = (p: NearbyPlace) => (lang === "ar" ? p.nameAr || p.name : p.name || p.nameAr) || t.unnamed[p.cat];

  return (
    <section className="map-nearby">
      <div className="map-nearby-head">
        <h3>{t.title}</h3>
        {state === "ready" && groups.length > 0 && (
          <button type="button" className="tool" aria-pressed={shown} onClick={() => { const next = !shown; setShown(next); onShow(next ? groups.flatMap((g) => g.items.slice(0, 5)) : null); }}>
            {shown ? t.hide : t.show}</button>
        )}
      </div>
      {!exact && <p className="muted">{t.fromArea}</p>}
      {state === "loading" && <p className="muted">{t.loading}</p>}
      {state === "unavailable" && <p className="muted">{t.unavailable}</p>}
      {state === "ready" && groups.length === 0 && <p className="muted">{t.none}</p>}
      {state === "ready" && groups.length > 0 && (
        <ul className="map-nearby-list">
          {groups.map((g) => (
            <li key={g.cat}>
              <button type="button" className="map-nearby-row" aria-expanded={open === g.cat} onClick={() => setOpen(open === g.cat ? null : g.cat)}>
                <span aria-hidden="true">{NEARBY_ICONS[g.cat]}</span>
                <strong>{t.categories[g.cat]}</strong>
                <span className="muted">{t.nearest} {km(g.items[0].d)} · {g.items.length}</span>
              </button>
              {open === g.cat && (
                <ol>{g.items.slice(0, 5).map((p, i) => <li key={i}><span dir="auto">{nameOf(p)}</span> <span className="muted">{km(p.d)}</span></li>)}</ol>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="map-nearby-credit muted">{t.credit} <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></p>
    </section>
  );
}
