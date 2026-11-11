"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExpressionSpecification, LngLatBoundsLike, Map as MlMap, Marker } from "maplibre-gl";

import { type Dictionary, optionLabel } from "@/i18n/dictionaries";
import { track } from "@/lib/analytics";
import { type Locale, mapStyleUrl } from "@/lib/config";
import type { MapArea, MapData, MapListing, MapUnit, Point } from "@/lib/content";
import { fill, formatters, interestHref as requestHref, loadMapLibre, unitTypeLabel } from "@/lib/format";
import type { NearbyPlace } from "@/lib/nearby";

import { AreaInsights, BudgetFilter, CompareTable, listingPrice, PriceBadge, priceBadge } from "./MapExtras";
import { NEARBY_ICONS, NearbyPlaces } from "./NearbyPlaces";

type Purpose = "all" | "Sale" | "Rent";
type MapText = Dictionary["pages"]["map"];

// Soft categorical colours for areas; readable over the light base map in both languages.
const PALETTE = ["#7c6fd6", "#e07a9b", "#3fa7a3", "#e3a33b", "#5b8def", "#9bbf4a", "#d9734e", "#4fb3d9", "#b76fc1", "#6c9a8b"];
const MUSCAT: Point = [58.38, 23.59];
const AREA_RADIUS_KM = 1.4; // areas without a drawn boundary are shown as a soft circle around their centre

function circle([lng, lat]: Point, km: number, steps = 64): GeoJSON.Polygon {
  const ring: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (km / 110.574) * Math.sin(a)]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

function bounds(points: Point[]): LngLatBoundsLike | null {
  if (!points.length) return null;
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

function areaPoints(area: MapArea): Point[] {
  if (area.boundary) {
    const rings = area.boundary.type === "Polygon" ? area.boundary.coordinates : area.boundary.coordinates.flat();
    return rings.flat() as Point[];
  }
  return area.center ? (circle(area.center, AREA_RADIUS_KM, 8).coordinates[0] as Point[]) : [];
}

/** Area labels hang below the area's southern edge: pins stand up from their point, so the two do not cover each other. */
function labelPoint(area: MapArea): Point {
  const points = areaPoints(area);
  const south = Math.min(...points.map((p) => p[1]));
  return [area.center![0], Number.isFinite(south) ? south : area.center![1]];
}

/** One view per listing per browser session for the owner's dashboard; never blocks or breaks the map. */
function countView(code: string) {
  try {
    const key = `aqar_viewed_${code}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch { /* storage blocked: count anyway */ }
  fetch("/api/views", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) })
    .catch(() => undefined);
}

function matches(item: MapListing, purpose: Purpose, kind: string) {
  const purposeOk = purpose === "all" || item.purpose === purpose || item.purpose === "Sale or Rent";
  return purposeOk && (!kind || item.kind === kind);
}

export function PropertyMap({ lang, dict, data }: { lang: Locale; dict: Dictionary; data: MapData }) {
  const t = dict.pages.map;
  const fmt = useMemo(() => formatters(lang), [lang]);
  const { count } = fmt;
  const areasById = useMemo(() => Object.fromEntries(data.areas.map((a) => [a.id, a])), [data.areas]);
  // Keyed by record id (not the localised name order) so an area keeps its colour in both languages.
  const colors = useMemo(() => Object.fromEntries([...data.areas].sort((a, b) => a.id.localeCompare(b.id))
    .map((a, i) => [a.id, PALETTE[i % PALETTE.length]])), [data.areas]);
  const kinds = useMemo(() => [...new Set(data.listings.map((l) => l.kind))], [data.listings]);

  const [purpose, setPurpose] = useState<Purpose>("all");
  const [kind, setKind] = useState("");
  const [view, setView] = useState<"map" | "list">("map");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading");
  const [budget, setBudget] = useState<{ monthly: number; maxSale: number } | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef<Marker[]>([]);
  // Pin elements by listing id, so hovering a card lights up its pin without redrawing the map.
  const pinEls = useRef<Map<string, HTMLElement>>(new Map());
  const listRef = useRef<HTMLUListElement>(null);
  // Deep link (?area=…&listing=…) read before the URL is rewritten; applied once the map is ready.
  const initialLink = useRef<string | null>(null);
  const linkApplied = useRef(false);

  // Budget: rent up to the monthly amount, buying up to the price that amount could carry (MapExtras.BudgetFilter).
  const affordable = useCallback((l: MapListing) => {
    if (!budget) return true;
    const p = listingPrice(l, purpose);
    if (!p.value) return true;
    return p.rent ? p.value <= budget.monthly : p.value <= budget.maxSale;
  }, [budget, purpose]);
  const filtered = useMemo(() => data.listings.filter((l) => matches(l, purpose, kind) && affordable(l)), [data.listings, purpose, kind, affordable]);
  const inScope = areaId ? filtered.filter((l) => l.area === areaId) : filtered;
  const compared = compare.map((id) => data.listings.find((l) => l.id === id)).filter((l): l is MapListing => !!l);
  const toggleCompare = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? c : [...c, id]));
  const selected = data.listings.find((l) => l.id === selectedId) || null;
  const [nearby, setNearby] = useState<NearbyPlace[] | null>(null);
  const nearbyMarkers = useRef<Marker[]>([]);
  // Per area: how many listings match, and the lowest price among them (rent and sale kept apart).
  const areaStats = useMemo(() => {
    const result: Record<string, { n: number; sale: number | null; rent: number | null }> = {};
    for (const l of filtered) {
      if (!l.area) continue;
      const s = (result[l.area] ??= { n: 0, sale: null, rent: null });
      s.n++;
      const p = listingPrice(l, purpose);
      if (!p.value) continue;
      if (p.rent) s.rent = Math.min(s.rent ?? Infinity, p.value);
      else s.sale = Math.min(s.sale ?? Infinity, p.value);
    }
    return result;
  }, [filtered, purpose]);
  const hot = useCallback((id: string | null) => {
    pinEls.current.forEach((el, key) => el.classList.toggle("hot", key === id));
  }, []);

  const title = useCallback((l: MapListing) => l.title || fill(t.inArea, {
    kind: optionLabel(dict, l.kind), area: (l.area && areasById[l.area]?.name) || "" }), [t, dict, areasById]);

  const price = (l: MapListing) => {
    const rent = l.rent_price && (l.purpose === "Rent" || (l.purpose === "Sale or Rent" && purpose !== "Sale"));
    if (l.type === "project") return l.price_from ? `${t.from} ${fmt.amount(l.price_from)} ${t.currency}` : t.priceOnRequest;
    if (rent) return `${fmt.amount(l.rent_price!)} ${t.currency} ${t.perMonth}`;
    return l.sale_price ? `${fmt.amount(l.sale_price)} ${t.currency}` : t.priceOnRequest;
  };

  const purposeTag = (l: MapListing) => (l.type === "project" ? optionLabel(dict, "Project")
    : l.purpose === "Rent" ? t.rent : l.purpose === "Sale" ? t.sale : `${t.sale} · ${t.rent}`);

  const unitLabel = (u: MapUnit) => unitTypeLabel(dict, lang, u.type, u.bedrooms);

  const interestHref = (l: MapListing) => {
    const rent = l.purpose === "Rent" || (l.purpose === "Sale or Rent" && purpose === "Rent");
    return requestHref(lang, { rent, kind: l.kind, area: l.area, budget: rent ? l.rent_price : l.sale_price || l.price_from,
      note: fill(t.interestNote, { ref: `${title(l)} (${l.id})` }), listing: { type: l.type, id: l.id },
      source: `/${lang}/map` });
  };

  // ---- map camera -------------------------------------------------------------------------------------------
  const fitAll = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const box = bounds([...data.areas.flatMap(areaPoints), ...data.listings.flatMap((l) => (l.point ? [l.point] : []))]);
    if (box) map.fitBounds(box, { padding: 60, maxZoom: 13, duration: 600 });
  }, [data]);

  const focusArea = useCallback((id: string) => {
    const area = areasById[id];
    const box = area && bounds(areaPoints(area));
    if (box && mapRef.current) mapRef.current.fitBounds(box, { padding: 80, maxZoom: 14.5, duration: 700 });
  }, [areasById]);

  const selectArea = useCallback((id: string | null) => {
    setAreaId(id);
    setSelectedId(null);
    if (id) focusArea(id);
    else fitAll();
  }, [focusArea, fitAll]);

  const selectListing = useCallback((l: MapListing) => {
    setSelectedId(l.id);
    track("map_listing_select", { listing_type: l.type, kind: l.kind });
    if (l.type === "property") countView(l.id);
    if (l.point) mapRef.current?.flyTo({ center: l.point, zoom: Math.max(mapRef.current.getZoom(), 15), duration: 800 });
    else if (l.area) focusArea(l.area);
  }, [focusArea]);

  // ---- create the map once ----------------------------------------------------------------------------------
  useEffect(() => {
    initialLink.current = window.location.search;
    let cancelled = false;
    let map: MlMap | undefined;
    (async () => {
      try {
        const ml = await loadMapLibre();
        if (cancelled || !container.current) return;
        libRef.current = ml;
        // A flat map that only shows what we have: no tilting or turning, just move and zoom.
        map = new ml.Map({ container: container.current, style: mapStyleUrl, center: MUSCAT, zoom: 10,
          attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0 });
        map.touchZoomRotate.disableRotation();
        mapRef.current = map;
        map.addControl(new ml.NavigationControl({ showCompass: false }), lang === "ar" ? "bottom-left" : "bottom-right");
        map.on("error", () => { if (!map?.isStyleLoaded()) setMapState((s) => (s === "loading" ? "error" : s)); });
        map.on("load", () => {
          if (!map) return;
          localizeLabels(map, lang);
          addAreaLayers(map, data.areas, colors);
          addPlotLayers(map, data.listings);
          map.on("click", "aqar-plots-fill", (e) => {
            const code = e.features?.[0]?.properties?.id;
            const hit = data.listings.find((l) => l.id === code);
            if (hit) { e.originalEvent.stopPropagation(); selectListing(hit); }
          });
          map.on("click", "aqar-areas-fill", (e) => {
            const id = e.features?.[0]?.properties?.id;
            if (typeof id === "string") selectArea(id);
          });
          let hovered: number | null = null;
          map.on("mousemove", "aqar-areas-fill", (e) => {
            const id = e.features?.[0]?.id;
            if (typeof id !== "number" || !map) return;
            if (hovered !== null) map.setFeatureState({ source: "aqar-areas", id: hovered }, { hover: false });
            hovered = id;
            map.setFeatureState({ source: "aqar-areas", id }, { hover: true });
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "aqar-areas-fill", () => {
            if (hovered !== null) map?.setFeatureState({ source: "aqar-areas", id: hovered }, { hover: false });
            hovered = null;
            if (map) map.getCanvas().style.cursor = "";
          });
          map.on("zoom", () => {
            const zoom = map?.getZoom() ?? 0;
            container.current?.classList.toggle("zoomed-in", zoom >= 14);
            // Narrow screens: names appear once zoomed in, so labels do not pile up.
            container.current?.classList.toggle("far", zoom < 12 && (container.current?.clientWidth ?? 0) < 640);
          });
          setMapState("ready");
        });
      } catch {
        setMapState("error");
      }
    })();
    return () => {
      cancelled = true;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once; data changes are applied by the effects below.
  }, []);

  // Initial view and deep links (?area=…&listing=…).
  useEffect(() => {
    if (mapState === "loading" || linkApplied.current) return;
    const params = new URLSearchParams(initialLink.current || "");
    const linked = data.listings.find((l) => l.id === params.get("listing"));
    const area = params.get("area");
    if (linked) selectListing(linked);
    else if (area && areasById[area]) selectArea(area);
    else fitAll();
    linkApplied.current = true;
  }, [mapState]);

  // Keep the URL shareable without adding history entries.
  useEffect(() => {
    if (!linkApplied.current) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("area");
    url.searchParams.delete("listing");
    if (selectedId) url.searchParams.set("listing", selectedId);
    else if (areaId) url.searchParams.set("area", areaId);
    window.history.replaceState(null, "", url);
  }, [areaId, selectedId]);

  // Selected area highlight.
  useEffect(() => {
    const map = mapRef.current;
    if (mapState !== "ready" || !map) return;
    data.areas.forEach((a, i) => map.setFeatureState({ source: "aqar-areas", id: i }, { selected: a.id === areaId }));
  }, [areaId, mapState, data.areas]);

  // Area labels and listing pins as HTML markers (native Arabic text rendering, keyboard focus).
  useEffect(() => {
    const map = mapRef.current;
    const ml = libRef.current;
    if (mapState !== "ready" || !map || !ml) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    pinEls.current.clear();
    const add = (el: HTMLElement, at: Point, anchor: "center" | "bottom" | "top" = "center") =>
      markers.current.push(new ml.Marker({ element: el, anchor }).setLngLat(at).addTo(map));

    for (const area of data.areas) {
      if (!area.center) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "map-area-label";
      el.style.setProperty("--area", colors[area.id]);
      el.setAttribute("aria-label", area.name);
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = area.name;
      el.append(name);
      const stats = areaStats[area.id];
      el.classList.toggle("empty", !stats);
      if (stats) {
        const badge = document.createElement("span");
        badge.className = "count";
        badge.textContent = String(stats.n);
        el.append(badge);
        // The lowest price here, so the map answers "what does it cost there?" without a click.
        const low = purpose === "Rent" ? stats.rent : purpose === "Sale" ? stats.sale : stats.sale ?? stats.rent;
        if (low) {
          const from = document.createElement("span");
          from.className = "from";
          from.textContent = `${t.legend.from} ${fmt.compact(low)}${low === stats.rent && low !== stats.sale ? ` ${t.perMonth}` : ""}`;
          el.append(from);
        }
        el.setAttribute("aria-label", `${area.name}: ${count(t.results, stats.n)}${low ? `, ${t.from} ${fmt.amount(low)} ${t.currency}` : ""}`);
      }
      el.addEventListener("click", (e) => { e.stopPropagation(); selectArea(area.id); });
      add(el, labelPoint(area), "top");
    }
    for (const l of filtered) {
      if (!l.point) continue;
      const el = document.createElement("button");
      el.type = "button";
      // Same price as the card: rent when it is let, or offered both ways and the visitor is not looking to buy.
      const rentPin = l.type === "property" && !!l.rent_price && (l.purpose === "Rent" || (l.purpose === "Sale or Rent" && purpose !== "Sale"));
      el.className = `map-pin ${l.type}${l.type === "property" ? (rentPin ? " rent" : " sale") : ""}${l.id === selectedId ? " active" : ""}`;
      el.setAttribute("aria-label", `${title(l)} — ${price(l)}`);
      if (l.type === "project") {
        el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5l7-3v19M11 21V9l9 3v9M2 21h20M7 8h1M7 12h1M7 16h1M14 14h2M14 17h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
        const label = document.createElement("span");
        label.textContent = title(l);
        el.append(label);
      } else {
        const value = rentPin ? l.rent_price : l.sale_price || l.rent_price;
        el.textContent = value ? fmt.compact(value) : "•";
        // A small card on hover: the photo, what it is and the full price, so the map answers "what is this?" at a glance.
        const peek = document.createElement("span");
        peek.className = "map-peek";
        peek.setAttribute("aria-hidden", "true");
        if (l.image) {
          const img = document.createElement("img");
          img.src = l.image;
          img.alt = "";
          img.loading = "lazy";
          peek.append(img);
        }
        const what = document.createElement("strong");
        what.textContent = title(l);
        const cost = document.createElement("span");
        cost.textContent = [price(l), l.bedrooms ? count(t.bedroomsCount, l.bedrooms) : ""].filter(Boolean).join(" · ");
        peek.append(what, cost);
        el.append(peek);
      }
      el.addEventListener("click", (e) => { e.stopPropagation(); selectListing(l); });
      el.addEventListener("mouseenter", () => {
        listRef.current?.querySelector(`[data-id="${CSS.escape(l.id)}"]`)?.classList.add("hot");
      });
      el.addEventListener("mouseleave", () => {
        listRef.current?.querySelectorAll(".hot").forEach((c) => c.classList.remove("hot"));
      });
      pinEls.current.set(l.id, el);
      add(el, l.point, "bottom");
    }
  }, [mapState, filtered, selectedId, areaStats]);

  // Nearby places chosen in the listing panel, as small markers (cleared when the listing changes).
  useEffect(() => {
    const map = mapRef.current;
    const ml = libRef.current;
    nearbyMarkers.current.forEach((m) => m.remove());
    nearbyMarkers.current = [];
    if (mapState !== "ready" || !map || !ml || !nearby) return;
    for (const p of nearby) {
      const el = document.createElement("span");
      el.className = "map-nearby-pin";
      el.textContent = NEARBY_ICONS[p.cat];
      el.title = (lang === "ar" ? p.nameAr || p.name : p.name || p.nameAr) ?? "";
      nearbyMarkers.current.push(new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
    }
  }, [nearby, mapState, lang]);
  useEffect(() => { if (!selectedId) setNearby(null); }, [selectedId]);

  useEffect(() => {
    if (view === "map") requestAnimationFrame(() => mapRef.current?.resize());
  }, [view]);

  const area = areaId ? areasById[areaId] : null;
  const card = (l: MapListing) => (
    <li key={l.id} onMouseEnter={() => hot(l.id)} onMouseLeave={() => hot(null)}>
      <button type="button" data-id={l.id} className={`map-card${l.id === selectedId ? " active" : ""}`} onClick={() => {
        if (view === "list") setView("map");
        selectListing(l);
      }}>
        {l.image ? <img src={l.image} alt="" loading="lazy" /> : <span className={`map-card-icon ${l.type}`} aria-hidden="true" />}
        <span className="map-card-body">
          <span className="tag">{purposeTag(l)}</span>
          <strong>{title(l)}</strong>
          <span className="muted">{(l.area && areasById[l.area]?.name) || ""}</span>
          <span className="map-card-price">{price(l)} <PriceBadge badge={priceBadge(l, data.listings, purpose)} t={t.extras} /></span>
          <span className="muted">{[
            l.bedrooms ? count(t.bedroomsCount, l.bedrooms) : null,
            l.size_sqm ? `${fmt.amount(l.size_sqm)} ${t.sizeUnit}` : null,
            l.available_units ? count(t.unitsAvailable, l.available_units) : null,
          ].filter(Boolean).join(" · ")}</span>
        </span>
      </button>
      {l.type === "property" && (
        <label className="map-compare-pick"><input type="checkbox" checked={compare.includes(l.id)} disabled={!compare.includes(l.id) && compare.length >= 3}
          onChange={() => toggleCompare(l.id)} /> {t.extras.compare}</label>
      )}
    </li>
  );

  return (
    <div className={`map-page ${view}`}>
      <div className="map-toolbar" role="toolbar" aria-label={t.mapLabel}>
        <div className="segmented" role="group">
          {(["all", "Sale", "Rent"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={purpose === p} onClick={() => setPurpose(p)}>
              {p === "all" ? t.all : p === "Sale" ? t.sale : t.rent}
            </button>
          ))}
        </div>
        <select aria-label={t.allTypes} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t.allTypes}</option>
          {kinds.map((k) => <option key={k} value={k}>{optionLabel(dict, k)}</option>)}
        </select>
        <select aria-label={t.searchArea} value={areaId || ""} onChange={(e) => selectArea(e.target.value || null)}>
          <option value="">{t.clear}</option>
          {data.areas.map((a) => <option key={a.id} value={a.id}>{a.name}{a.wilayat ? ` — ${a.wilayat}` : ""}</option>)}
        </select>
        <BudgetFilter t={t.extras} fmt={fmt} currency={t.currency} value={budget} onChange={setBudget} />
        {compared.length > 0 && (
          <button type="button" className="tool map-compare-btn" onClick={() => setShowCompare(true)}>⚖ {t.extras.compareCount.replace("{n}", String(compared.length))}</button>
        )}
        <div className="segmented map-view-switch" role="group">
          <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>{t.mapView}</button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>{t.listView}</button>
        </div>
      </div>

      <div className="map-app">
        <aside className="map-panel" aria-live="polite">
          {selected ? (
            <article className="map-detail">
              <button type="button" className="map-back" onClick={() => setSelectedId(null)}>{t.back}</button>
              {selected.image && <img src={selected.image} alt="" />}
              <span className="tag">{purposeTag(selected)}</span>
              <h2>{title(selected)}</h2>
              <p className="muted">{[selected.area && areasById[selected.area]?.name, selected.area && areasById[selected.area]?.wilayat]
                .filter(Boolean).join(lang === "ar" ? "، " : ", ")}</p>
              <p className="price">{price(selected)} <PriceBadge badge={priceBadge(selected, data.listings, purpose)} t={t.extras} /></p>
              {selected.type === "property" && (
                <button type="button" className="tool" aria-pressed={compare.includes(selected.id)} disabled={!compare.includes(selected.id) && compare.length >= 3}
                  onClick={() => toggleCompare(selected.id)}>⚖ {compare.includes(selected.id) ? t.extras.inCompare : t.extras.addCompare}</button>
              )}
              {!selected.exact && <p className="map-approx">{t.approx}</p>}
              <dl className="map-facts">
                {selected.bedrooms ? <><dt>{t.bedrooms}</dt><dd>{selected.bedrooms}</dd></> : null}
                {selected.size_sqm ? <><dt>{t.size}</dt><dd>{fmt.amount(selected.size_sqm)} {t.sizeUnit}</dd></> : null}
                {selected.plot ? <><dt>{t.plotArea}</dt><dd>{fmt.amount(selected.plot.area_sqm)} {t.sizeUnit}{selected.plot.land_use ? ` · ${selected.plot.land_use}` : ""}</dd></> : null}
                {selected.construction_status ? <><dt>{t.status}</dt>
                  <dd>{t.statuses[selected.construction_status] || optionLabel(dict, selected.construction_status)}</dd></> : null}
                {selected.handover ? <><dt>{t.handover}</dt><dd>{selected.handover}</dd></> : null}
                {selected.developer ? <><dt>{t.developer}</dt><dd>{selected.developer}</dd></> : null}
                {selected.available_units ? <><dt>{t.availability}</dt><dd>{count(t.unitsAvailable, selected.available_units)}</dd></> : null}
              </dl>
              {selected.units && selected.units.length > 0 && (
                <section>
                  <h3>{t.units}</h3>
                  <ul className="map-units">
                    {selected.units.map((u, i) => (
                      <li key={i}>
                        <strong>{unitLabel(u)}</strong>
                        <span>{u.size_from ? `${fmt.amount(u.size_from)}${u.size_to ? `–${fmt.amount(u.size_to)}` : ""} ${t.sizeUnit}` : ""}</span>
                        <span>{u.price_from ? `${t.from} ${fmt.amount(u.price_from)} ${t.currency}` : t.priceOnRequest}</span>
                        {u.available && <span className="tag">{fill(t.available, { n: u.available })}</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {selected.payment_plan && (
                <section>
                  <h3>{t.paymentPlan}</h3>
                  <ul className="map-plan">{selected.payment_plan.split("\n").filter(Boolean).map((line) => <li key={line}>{line}</li>)}</ul>
                </section>
              )}
              {selected.summary && <p>{selected.summary}</p>}
              {(selected.point || (selected.area && areasById[selected.area]?.center)) && (
                <NearbyPlaces lang={lang} t={t.nearby} from={(selected.point ?? areasById[selected.area!]!.center)!} exact={!!selected.point && selected.exact}
                  onShow={setNearby} />
              )}
              <div className="actions">
                <Link className="btn primary" href={interestHref(selected)}>{t.registerInterest}</Link>
                {selected.slug && <Link className="btn secondary" href={`/${lang}/projects/${selected.slug}`}>{t.projectPage}</Link>}
              </div>
            </article>
          ) : (
            <>
              {area ? (
                <header className="map-area-head" style={{ ["--area" as string]: colors[area.id] }}>
                  <button type="button" className="map-back" onClick={() => selectArea(null)}>{t.clear}</button>
                  <h2>{area.name}</h2>
                  {area.wilayat && <p className="muted">{area.wilayat}</p>}
                  <AreaInsights listings={data.listings.filter((l) => l.area === area.id)} demand={area.demand} t={t.extras} fmt={fmt} currency={t.currency} />
                  <div className="actions">
                    {area.guide_slug && <Link className="btn secondary" href={`/${lang}/areas/${area.guide_slug}`}>{t.readGuide}</Link>}
                    <Link className="btn secondary" href={`/${lang}/find-me-a-property?areas=${encodeURIComponent(area.id)}${purpose !== "all" ? `&purpose=${purpose === "Rent" ? "Rent" : "Buy"}` : ""}${budget ? `&budget_max=${purpose === "Rent" ? budget.monthly : budget.maxSale}` : ""}`}>🔔 {t.extras.alertMe}</Link>
                  </div>
                  <p className="map-count">{count(t.areaResults, inScope.length)}</p>
                </header>
              ) : (
                <p className="map-count">{count(t.results, inScope.length)}</p>
              )}
              {inScope.length > 0 ? <ul className="map-list" ref={listRef}>{inScope.map(card)}</ul> : (
                <div className="map-empty">
                  <p>{t.noResults}</p>
                  <Link className="btn primary" href={`/${lang}/find-me-a-property${areaId ? `?areas=${encodeURIComponent(areaId)}` : ""}`}>
                    {t.startRequest}</Link>
                </div>
              )}
            </>
          )}
        </aside>
        <div className="map-stage">
          {showCompare && compared.length > 0 && (
            <CompareTable items={compared} t={t.extras} fmt={fmt} currency={t.currency} title={title} all={data.listings} purpose={purpose}
              areaName={(l) => (l.area && areasById[l.area]?.name) || ""} onRemove={(id) => toggleCompare(id)} onClose={() => setShowCompare(false)} />
          )}
          <div ref={container} className="map-canvas" role="region" aria-label={t.mapLabel} />
          {mapState === "ready" && (
            <ul className="map-legend" aria-label={t.legend.title}>
              {purpose !== "Rent" && <li><i className="sale" />{t.sale}</li>}
              {purpose !== "Sale" && <li><i className="rent" />{t.rent}</li>}
              {data.listings.some((l) => l.type === "project") && <li><i className="project" />{t.legend.project}</li>}
              <li><i className="area" />{t.legend.area}</li>
            </ul>
          )}
          {mapState !== "ready" && <p className={`map-status ${mapState}`}>{mapState === "error" ? t.unavailable : t.loading}</p>}
        </div>
      </div>
    </div>
  );
}

function localizeLabels(map: MlMap, lang: Locale) {
  const name: ExpressionSpecification = lang === "ar" ? ["coalesce", ["get", "name:ar"], ["get", "name"]]
    : ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name"]];
  for (const layer of map.getStyle().layers) {
    if (layer.type !== "symbol") continue;
    const field = map.getLayoutProperty(layer.id, "text-field");
    if (field && JSON.stringify(field).includes("name")) map.setLayoutProperty(layer.id, "text-field", name);
  }
}

function addAreaLayers(map: MlMap, areas: MapArea[], colors: Record<string, string>) {
  const features: GeoJSON.Feature[] = areas.flatMap((a, i) => {
    const geometry = a.boundary || (a.center ? circle(a.center, AREA_RADIUS_KM) : null);
    return geometry ? [{ type: "Feature" as const, id: i, geometry, properties: { id: a.id, color: colors[a.id] } }] : [];
  });
  map.addSource("aqar-areas", { type: "geojson", data: { type: "FeatureCollection", features } });
  // Below the base map's labels so street and place names stay readable.
  const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
  map.addLayer({ id: "aqar-areas-fill", type: "fill", source: "aqar-areas", paint: {
    "fill-color": ["get", "color"],
    // Fades when zoomed in so streets and buildings stay visible inside an area.
    "fill-opacity": ["interpolate", ["linear"], ["zoom"],
      12, ["case", ["boolean", ["feature-state", "selected"], false], 0.45,
        ["boolean", ["feature-state", "hover"], false], 0.36, 0.22],
      15, ["case", ["boolean", ["feature-state", "selected"], false], 0.12, 0.06]],
  } }, firstLabel);
  map.addLayer({ id: "aqar-areas-line", type: "line", source: "aqar-areas", paint: {
    "line-color": ["get", "color"], "line-opacity": 0.9,
    "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 1.5],
  } }, firstLabel);
}

/** Plot outlines from croquis that staff published; they appear once the map is zoomed in to street level. */
function addPlotLayers(map: MlMap, listings: MapListing[]) {
  const features: GeoJSON.Feature[] = listings.filter((l) => l.plot).map((l) => ({ type: "Feature" as const, properties: { id: l.id },
    geometry: { type: "Polygon" as const, coordinates: [l.plot!.polygon] } }));
  map.addSource("aqar-plots", { type: "geojson", data: { type: "FeatureCollection", features } });
  map.addLayer({ id: "aqar-plots-fill", type: "fill", source: "aqar-plots", minzoom: 12, paint: { "fill-color": "#e3a33b", "fill-opacity": 0.35 } });
  map.addLayer({ id: "aqar-plots-line", type: "line", source: "aqar-plots", minzoom: 12, paint: { "line-color": "#b42318", "line-width": 2 } });
}
