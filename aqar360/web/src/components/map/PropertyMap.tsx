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

/** Area labels sit on the area's northern edge so they never cover the pins near its centre. */
function labelPoint(area: MapArea): Point {
  const points = areaPoints(area);
  const north = Math.max(...points.map((p) => p[1]));
  return [area.center![0], Number.isFinite(north) ? north : area.center![1]];
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
  const [threeD, setThreeD] = useState(false);
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading");

  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef<Marker[]>([]);
  // Deep link (?area=…&listing=…) read before the URL is rewritten; applied once the map is ready.
  const initialLink = useRef<string | null>(null);
  const linkApplied = useRef(false);

  const filtered = useMemo(() => data.listings.filter((l) => matches(l, purpose, kind)), [data.listings, purpose, kind]);
  const inScope = areaId ? filtered.filter((l) => l.area === areaId) : filtered;
  const selected = data.listings.find((l) => l.id === selectedId) || null;
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const l of filtered) if (l.area) result[l.area] = (result[l.area] || 0) + 1;
    return result;
  }, [filtered]);

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
  }, [focusArea]);

  const selectListing = useCallback((l: MapListing) => {
    setSelectedId(l.id);
    track("map_listing_select", { listing_type: l.type, kind: l.kind });
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
        map = new ml.Map({ container: container.current, style: mapStyleUrl, center: MUSCAT, zoom: 10,
          attributionControl: { compact: true } });
        mapRef.current = map;
        map.addControl(new ml.NavigationControl({ visualizePitch: true }), lang === "ar" ? "bottom-left" : "bottom-right");
        map.on("error", () => { if (!map?.isStyleLoaded()) setMapState((s) => (s === "loading" ? "error" : s)); });
        map.on("load", () => {
          if (!map) return;
          localizeLabels(map, lang);
          addAreaLayers(map, data.areas, colors);
          add3dBuildings(map);
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
    const add = (el: HTMLElement, at: Point, anchor: "center" | "bottom" = "center") =>
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
      if (counts[area.id]) {
        const badge = document.createElement("span");
        badge.className = "count";
        badge.textContent = String(counts[area.id]);
        el.append(badge);
      }
      el.addEventListener("click", (e) => { e.stopPropagation(); selectArea(area.id); });
      add(el, labelPoint(area), "bottom");
    }
    for (const l of filtered) {
      if (!l.point) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = `map-pin ${l.type}${l.id === selectedId ? " active" : ""}`;
      el.setAttribute("aria-label", `${title(l)} — ${price(l)}`);
      if (l.type === "project") {
        el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5l7-3v19M11 21V9l9 3v9M2 21h20M7 8h1M7 12h1M7 16h1M14 14h2M14 17h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
        const label = document.createElement("span");
        label.textContent = title(l);
        el.append(label);
      } else {
        const value = l.rent_price && l.purpose !== "Sale" && purpose !== "Sale" ? l.rent_price : l.sale_price || l.rent_price;
        el.textContent = value ? fmt.compact(value) : "•";
      }
      el.addEventListener("click", (e) => { e.stopPropagation(); selectListing(l); });
      add(el, l.point, "bottom");
    }
  }, [mapState, filtered, selectedId, counts]);

  useEffect(() => {
    const map = mapRef.current;
    if (mapState !== "ready" || !map) return;
    if (map.getLayer("aqar-3d")) map.setLayoutProperty("aqar-3d", "visibility", threeD ? "visible" : "none");
    map.easeTo({ pitch: threeD ? 55 : 0, bearing: threeD ? -17 : 0, duration: 700 });
  }, [threeD, mapState]);

  useEffect(() => {
    if (view === "map") requestAnimationFrame(() => mapRef.current?.resize());
  }, [view]);

  const reset = () => {
    setAreaId(null);
    setSelectedId(null);
    setThreeD(false);
    fitAll();
  };

  const area = areaId ? areasById[areaId] : null;
  const card = (l: MapListing) => (
    <li key={l.id}>
      <button type="button" className={`map-card${l.id === selectedId ? " active" : ""}`} onClick={() => {
        if (view === "list") setView("map");
        selectListing(l);
      }}>
        {l.image ? <img src={l.image} alt="" loading="lazy" /> : <span className={`map-card-icon ${l.type}`} aria-hidden="true" />}
        <span className="map-card-body">
          <span className="tag">{purposeTag(l)}</span>
          <strong>{title(l)}</strong>
          <span className="muted">{(l.area && areasById[l.area]?.name) || ""}</span>
          <span className="map-card-price">{price(l)}</span>
          <span className="muted">{[
            l.bedrooms ? count(t.bedroomsCount, l.bedrooms) : null,
            l.size_sqm ? `${fmt.amount(l.size_sqm)} ${t.sizeUnit}` : null,
            l.available_units ? count(t.unitsAvailable, l.available_units) : null,
          ].filter(Boolean).join(" · ")}</span>
        </span>
      </button>
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
        <div className="segmented" role="group">
          <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>{t.mapView}</button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>{t.listView}</button>
        </div>
        {view === "map" && mapState === "ready" && (
          <>
            <button type="button" className="tool" aria-pressed={threeD} onClick={() => setThreeD(!threeD)}>{t.threeD}</button>
            <button type="button" className="tool" onClick={reset}>{t.resetView}</button>
          </>
        )}
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
              <p className="price">{price(selected)}</p>
              {!selected.exact && <p className="map-approx">{t.approx}</p>}
              <dl className="map-facts">
                {selected.bedrooms ? <><dt>{t.bedrooms}</dt><dd>{selected.bedrooms}</dd></> : null}
                {selected.size_sqm ? <><dt>{t.size}</dt><dd>{fmt.amount(selected.size_sqm)} {t.sizeUnit}</dd></> : null}
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
                  <div className="actions">
                    {area.guide_slug && <Link className="btn secondary" href={`/${lang}/areas/${area.guide_slug}`}>{t.readGuide}</Link>}
                    <Link className="btn secondary" href={`/${lang}/find-me-a-property?areas=${encodeURIComponent(area.id)}`}>{t.searchHere}</Link>
                  </div>
                  <p className="map-count">{count(t.areaResults, inScope.length)}</p>
                </header>
              ) : (
                <p className="map-count">{count(t.results, inScope.length)}</p>
              )}
              {inScope.length > 0 ? <ul className="map-list">{inScope.map(card)}</ul> : (
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
          <div ref={container} className="map-canvas" role="region" aria-label={t.mapLabel} />
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

function add3dBuildings(map: MlMap) {
  const building = map.getStyle().layers.find((l) => "source-layer" in l && l["source-layer"] === "building");
  if (!building || !("source" in building)) return;
  map.addLayer({ id: "aqar-3d", type: "fill-extrusion", source: building.source as string, "source-layer": "building",
    minzoom: 13, layout: { visibility: "none" }, paint: {
      "fill-extrusion-color": "#d6dbe3",
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": 0.75,
    } });
}
