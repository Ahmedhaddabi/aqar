"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState } from "react";

import { mapStyleUrl } from "@/lib/config";
import { loadMapLibre } from "@/lib/format";

type AreaPoint = { id: number; name: string; lat: number | null; lng: number | null; boundary: unknown; demand: number; supply: number; unmet: number };
type Mode = "demand" | "gap" | "unmet";

/** Heat map of demand by area: outlined areas are filled, others shown as circles sized by the number. */
export function MarketMap({ areas, labels }: { areas: AreaPoint[]; labels: Record<Mode, string> }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [mode, setMode] = useState<Mode>("demand");

  const value = (a: AreaPoint, m: Mode) => (m === "demand" ? a.demand : m === "unmet" ? a.unmet : Math.max(0, a.demand - a.supply));
  const data = (m: Mode): GeoJSON.FeatureCollection => {
    const max = Math.max(1, ...areas.map((a) => value(a, m)));
    const features: GeoJSON.Feature[] = [];
    for (const a of areas) {
      const v = value(a, m);
      const props = { name: a.name, v, w: v / max, label: `${a.name}\n${v}` };
      const b = a.boundary as GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
      if (b && (b.type === "Polygon" || b.type === "MultiPolygon")) features.push({ type: "Feature", properties: props, geometry: b });
      if (a.lat != null && a.lng != null) features.push({ type: "Feature", properties: { ...props, point: 1 }, geometry: { type: "Point", coordinates: [a.lng, a.lat] } });
    }
    return { type: "FeatureCollection", features };
  };

  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    loadMapLibre().then((ml) => {
      if (cancelled || !box.current) return;
      const pts = areas.filter((a) => a.lat != null && a.lng != null);
      const center: [number, number] = pts.length ? [pts.reduce((s, a) => s + a.lng!, 0) / pts.length, pts.reduce((s, a) => s + a.lat!, 0) / pts.length] : [58.38, 23.59];
      map = new ml.Map({ container: box.current, style: mapStyleUrl, center, zoom: 10.5, attributionControl: { compact: true } });
      map.addControl(new ml.NavigationControl({ showCompass: false }));
      map.on("load", () => {
        map!.addSource("market", { type: "geojson", data: data("demand") });
        const color = ["interpolate", ["linear"], ["get", "w"], 0, "#e3f2f1", 0.5, "#e3a33b", 1, "#b42318"] as unknown as import("maplibre-gl").ExpressionSpecification;
        map!.addLayer({ id: "m-fill", type: "fill", source: "market", filter: ["==", "$type", "Polygon"], paint: { "fill-color": color, "fill-opacity": 0.55 } });
        map!.addLayer({ id: "m-line", type: "line", source: "market", filter: ["==", "$type", "Polygon"], paint: { "line-color": "#102f4c", "line-width": 1 } });
        map!.addLayer({ id: "m-dot", type: "circle", source: "market", filter: ["==", "$type", "Point"], paint: {
          "circle-color": color, "circle-opacity": 0.85, "circle-stroke-color": "#102f4c", "circle-stroke-width": 1,
          "circle-radius": ["interpolate", ["linear"], ["get", "w"], 0, 8, 1, 30] as unknown as import("maplibre-gl").ExpressionSpecification } });
        map!.addLayer({ id: "m-label", type: "symbol", source: "market", filter: ["==", "$type", "Point"],
          layout: { "text-field": ["get", "label"] as unknown as import("maplibre-gl").ExpressionSpecification, "text-size": 12 },
          paint: { "text-color": "#102f4c", "text-halo-color": "#fff", "text-halo-width": 1.5 } });
      });
      mapRef.current = map;
    });
    return () => { cancelled = true; map?.remove(); };
    // Created once; the mode effect below swaps the data.
  }, []);

  useEffect(() => {
    const src = mapRef.current?.getSource("market") as import("maplibre-gl").GeoJSONSource | undefined;
    src?.setData(data(mode));
  }, [mode]);

  return (
    <div>
      <div className="a-tabs" role="group">
        {(Object.keys(labels) as Mode[]).map((m) => (
          <button key={m} type="button" className={`a-btn small${m === mode ? " current" : ""}`} onClick={() => setMode(m)}>{labels[m]}</button>
        ))}
      </div>
      <div ref={box} className="a-map a-market-map" />
    </div>
  );
}
