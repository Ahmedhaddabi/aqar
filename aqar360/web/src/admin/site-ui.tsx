"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState } from "react";

import type { Faq } from "@/db/schema";
import { mapStyleUrl } from "@/lib/config";
import { loadMapLibre } from "@/lib/format";

import type { AdminDict } from "./i18n";

type Pt = [number, number]; // [lng, lat]
const MUSCAT: Pt = [58.38, 23.59];
const round = (v: number) => Number(v.toFixed(6));

function outlineData(points: Pt[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = points.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } }));
  if (points.length >= 2) features.push({ type: "Feature", properties: {},
    geometry: points.length >= 3 ? { type: "Polygon", coordinates: [[...points, points[0]]] } : { type: "LineString", coordinates: points } });
  return { type: "FeatureCollection", features };
}

/** One map for an area: "centre" mode places the pin, "outline" mode adds outline points. Writes hidden lat/lng/boundary. */
export function AreaMapEditor({ lat, lng, boundary, t }: {
  lat: number | null; lng: number | null; boundary: GeoJSON.Polygon | GeoJSON.MultiPolygon | null; t: AdminDict["site"];
}) {
  const initial = boundary?.type === "Polygon" ? (boundary.coordinates[0].slice(0, -1) as Pt[]) : [];
  const [centre, setCentre] = useState<Pt | null>(lat != null && lng != null ? [lng, lat] : null);
  const [points, setPoints] = useState<Pt[]>(initial);
  const [mode, setMode] = useState<"centre" | "outline">("centre");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);

  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    loadMapLibre().then((ml) => {
      if (cancelled || !container.current) return;
      libRef.current = ml;
      map = new ml.Map({ container: container.current, style: mapStyleUrl, center: centre ?? initial[0] ?? MUSCAT,
        zoom: centre || initial.length ? 13 : 10, attributionControl: { compact: true } });
      map.addControl(new ml.NavigationControl({ showCompass: false }));
      map.on("load", () => {
        map!.addSource("outline", { type: "geojson", data: outlineData(initial) });
        map!.addLayer({ id: "outline-fill", type: "fill", source: "outline", filter: ["==", "$type", "Polygon"],
          paint: { "fill-color": "#0e7c7b", "fill-opacity": 0.15 } });
        map!.addLayer({ id: "outline-line", type: "line", source: "outline", filter: ["!=", "$type", "Point"],
          paint: { "line-color": "#0e7c7b", "line-width": 2 } });
        map!.addLayer({ id: "outline-points", type: "circle", source: "outline", filter: ["==", "$type", "Point"],
          paint: { "circle-radius": 5, "circle-color": "#fff", "circle-stroke-color": "#0e7c7b", "circle-stroke-width": 2 } });
      });
      map.on("click", (e) => {
        const p: Pt = [round(e.lngLat.lng), round(e.lngLat.lat)];
        if (modeRef.current === "centre") setCentre(p);
        else setPoints((rows) => [...rows, p]);
      });
      mapRef.current = map;
      if (centre) markerRef.current = new ml.Marker({ color: "#0e7c7b" }).setLngLat(centre).addTo(map);
    });
    return () => { cancelled = true; map?.remove(); };
    // The map is created once; changes are applied by the effects below.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const ml = libRef.current;
    if (!map || !ml) return;
    markerRef.current?.remove();
    markerRef.current = centre ? new ml.Marker({ color: "#0e7c7b" }).setLngLat(centre).addTo(map) : null;
  }, [centre]);

  useEffect(() => {
    const source = mapRef.current?.getSource("outline") as import("maplibre-gl").GeoJSONSource | undefined;
    source?.setData(outlineData(points));
  }, [points]);

  const polygon = points.length >= 3 ? JSON.stringify({ type: "Polygon", coordinates: [[...points, points[0]]] }) : "";
  return (
    <div className="a-mappicker">
      <div className="a-tabs" role="group">
        <button type="button" className={`a-btn small${mode === "centre" ? " current" : ""}`} onClick={() => setMode("centre")}>📍 {t.centre}</button>
        <button type="button" className={`a-btn small${mode === "outline" ? " current" : ""}`} onClick={() => setMode("outline")}>✏️ {t.boundary}</button>
      </div>
      {mode === "outline" && (
        <div className="a-inline" style={{ marginTop: 8 }}>
          <span className="a-muted">{t.boundaryHelp} ({t.points.replace("{n}", String(points.length))})</span>
          <button type="button" className="a-btn small" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={!points.length}>{t.undo}</button>
          <button type="button" className="a-btn small danger" onClick={() => setPoints([])} disabled={!points.length}>{t.clear}</button>
        </div>
      )}
      <div ref={container} className="a-map" />
      <input type="hidden" name="lat" value={centre ? centre[1] : ""} />
      <input type="hidden" name="lng" value={centre ? centre[0] : ""} />
      <input type="hidden" name="boundary" value={polygon} />
      {centre && <p className="a-muted" dir="ltr">{centre[1]}, {centre[0]}</p>}
    </div>
  );
}

/** Questions and answers in both languages; sent as JSON in one hidden field. */
export function FaqEditor({ initial, t }: { initial: Faq[]; t: AdminDict["site"] }) {
  const [rows, setRows] = useState<Faq[]>(initial);
  const set = (i: number, key: keyof Faq, value: string) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [key]: value } : row)));
  const fields: [keyof Faq, string, "ltr" | "rtl"][] = [["questionEn", t.questionEn, "ltr"], ["answerEn", t.answerEn, "ltr"],
    ["questionAr", t.questionAr, "rtl"], ["answerAr", t.answerAr, "rtl"]];
  return (
    <div className="a-rows">
      {rows.map((row, i) => (
        <div key={i} className="a-faq-row">
          {fields.map(([key, label, dir]) => (
            <label key={key} className="a-field"><span>{label}</span>
              {key.startsWith("answer") ? <textarea rows={2} value={row[key]} dir={dir} onChange={(e) => set(i, key, e.target.value)} />
                : <input value={row[key]} dir={dir} onChange={(e) => set(i, key, e.target.value)} />}</label>
          ))}
          <div><button type="button" className="a-btn small danger" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>{t.remove}</button></div>
        </div>
      ))}
      <div><button type="button" className="a-btn small" onClick={() => setRows((r) => [...r, { questionEn: "", answerEn: "", questionAr: "", answerAr: "" }])}>
        + {t.addFaq}</button></div>
      <input type="hidden" name="faqs" value={JSON.stringify(rows.filter((r) => r.questionEn || r.questionAr))} />
    </div>
  );
}
