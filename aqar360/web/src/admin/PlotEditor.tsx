"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { deletePlot, savePlot, uploadCroquis } from "@/app/admin/plot-actions";
import { mapStyleUrl } from "@/lib/config";
import { CRS_OPTIONS, type CrsKey, type LngLat, plotGeometry } from "@/lib/geo";
import { loadMapLibre } from "@/lib/format";

import type { AdminDict } from "./i18n";

type T = AdminDict["plot"];
type Row = { label: string; e: string; n: string };
export type PlotInitial = { plotNumber: string | null; block: string | null; location: string | null; landUse: string | null; statedAreaSqm: number | null;
  crs: string; points: { label?: string; e: number; n: number }[]; public: boolean; notes: string; documentId: number | null } | null;

const toPoints = (rows: Row[]) => rows.map((r) => ({ label: r.label || undefined, e: Number(r.e), n: Number(r.n) })).filter((p) => p.e && p.n);
/** The same corners on the other datum, drawn dashed when the croquis does not say which one it uses. */
const otherDatum = (crs: CrsKey): CrsKey => (crs.startsWith("wgs84") ? (crs.replace("wgs84", "psd93") as CrsKey) : (crs.replace("psd93", "wgs84") as CrsKey));

/** Small map with the plot outline (solid) and, optionally, the other datum's outline (dashed) for comparison. */
export function PlotPreview({ polygon, ghost, height = 320 }: { polygon: LngLat[] | null; ghost?: LngLat[] | null; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    loadMapLibre().then((ml) => {
      if (!box.current) return;
      map = new ml.Map({ container: box.current, style: mapStyleUrl, center: [58.38, 23.59], zoom: 10, attributionControl: { compact: true } });
      map.addControl(new ml.NavigationControl({ showCompass: false }));
      map.on("load", () => {
        map!.addSource("plot", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map!.addSource("ghost", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map!.addLayer({ id: "ghost-line", type: "line", source: "ghost", paint: { "line-color": "#9a6400", "line-width": 2, "line-dasharray": [2, 2] } });
        map!.addLayer({ id: "plot-fill", type: "fill", source: "plot", paint: { "fill-color": "#e3a33b", "fill-opacity": 0.3 } });
        map!.addLayer({ id: "plot-line", type: "line", source: "plot", paint: { "line-color": "#b42318", "line-width": 2.5 } });
        mapRef.current = map!;
        setReady(true);
      });
    });
    return () => map?.remove();
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const fc = (ring: LngLat[] | null | undefined) => ({ type: "FeatureCollection" as const,
      features: ring ? [{ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } }] : [] });
    (map.getSource("plot") as import("maplibre-gl").GeoJSONSource).setData(fc(polygon));
    (map.getSource("ghost") as import("maplibre-gl").GeoJSONSource).setData(fc(ghost));
    const all = [...(polygon ?? []), ...(ghost ?? [])];
    if (all.length) {
      const lngs = all.map((p) => p[0]);
      const lats = all.map((p) => p[1]);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60, maxZoom: 18, duration: 500 });
    }
  }, [ready, polygon, ghost]);
  return <div ref={box} className="a-plot-map" style={{ height }} />;
}

export function PlotEditor({ t, propertyId, initial, ai }: { t: T; propertyId: number; initial: PlotInitial; ai: boolean }) {
  const router = useRouter();
  const [crs, setCrs] = useState<CrsKey>((CRS_OPTIONS as readonly string[]).includes(initial?.crs ?? "") ? (initial!.crs as CrsKey) : "wgs84_utm40");
  const [rows, setRows] = useState<Row[]>(initial?.points.length ? initial.points.map((p) => ({ label: p.label ?? "", e: String(p.e), n: String(p.n) }))
    : [{ label: "1", e: "", n: "" }, { label: "2", e: "", n: "" }, { label: "3", e: "", n: "" }, { label: "4", e: "", n: "" }]);
  const [f, setF] = useState({ plotNumber: initial?.plotNumber ?? "", block: initial?.block ?? "", location: initial?.location ?? "", landUse: initial?.landUse ?? "",
    statedAreaSqm: initial?.statedAreaSqm ? String(initial.statedAreaSqm) : "", notes: initial?.notes ?? "" });
  const [isPublic, setPublic] = useState(initial?.public ?? false);
  const [useAsLocation, setUseAsLocation] = useState(!initial);
  const [documentId, setDocumentId] = useState<number | null>(initial?.documentId ?? null);
  const [datumUnknown, setDatumUnknown] = useState(false);
  const [state, setState] = useState<"idle" | "reading" | "saving" | string>("idle");

  const points = useMemo(() => toPoints(rows), [rows]);
  const geo = useMemo(() => plotGeometry(points, crs), [points, crs]);
  const ghost = useMemo(() => (datumUnknown ? plotGeometry(points, otherDatum(crs))?.polygon ?? null : null), [datumUnknown, points, crs]);
  const stated = Number(f.statedAreaSqm);
  const diff = geo && stated > 0 ? Math.round(((geo.areaSqm - stated) / stated) * 1000) / 10 : null;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setState("reading");
    const data = new FormData();
    data.append("propertyId", String(propertyId));
    data.append("file", file);
    const r = await uploadCroquis(data);
    if (!r.ok) return setState(t.uploadFailed);
    setDocumentId(r.documentId ?? null);
    const read = r.read;
    if (!read) return setState(ai ? t.notRead : t.savedNoAi);
    setF((x) => ({ ...x, plotNumber: read.plotNumber ?? x.plotNumber, block: read.block ?? x.block, location: read.location ?? x.location,
      landUse: read.landUse ?? x.landUse, statedAreaSqm: read.areaSqm ? String(read.areaSqm) : x.statedAreaSqm }));
    if (read.points.length >= 3) setRows(read.points.map((p, i) => ({ label: p.label ?? String(i + 1), e: String(p.easting), n: String(p.northing) })));
    const zone = read.utmZone ?? 40;
    if (read.datum === "PSD93") setCrs(`psd93_utm${zone}` as CrsKey);
    else if (read.datum === "WGS84") setCrs(`wgs84_utm${zone}` as CrsKey);
    setDatumUnknown(read.datum === "unknown");
    setState(read.datum === "unknown" ? t.readCheckDatum : t.read);
  };

  const save = async () => {
    setState("saving");
    const data = new FormData();
    data.append("propertyId", String(propertyId));
    data.append("crs", crs);
    for (const [k, v] of Object.entries(f)) data.append(k, v);
    data.append("points", JSON.stringify(points));
    if (documentId) data.append("documentId", String(documentId));
    if (isPublic) data.append("public", "on");
    if (useAsLocation) data.append("useAsLocation", "on");
    const r = await savePlot(data);
    setState(r.ok ? t.saved : r.error === "points" ? t.badPoints : t.invalid);
    if (r.ok) router.refresh();
  };

  const field = (key: keyof typeof f, label: string, dir: "ltr" | "auto" = "auto") => (
    <label className="a-field"><span>{label}</span><input value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} dir={dir} /></label>
  );
  return (
    <section className="a-panel" id="plot">
      <h2>🗺 {t.title}</h2>
      <p className="a-muted">{t.intro}</p>
      <div className="a-inline">
        <label className="a-btn">{state === "reading" ? t.reading : `📄 ${t.upload}`}
          <input type="file" accept="application/pdf,image/*" hidden disabled={state === "reading"} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
        {!["idle", "reading", "saving"].includes(state) && <span className={state === t.saved || state === t.read ? "a-ok-text" : "a-warn"}>{state}</span>}
      </div>
      <div className="a-grid-fields">
        {field("plotNumber", t.plotNumber, "ltr")}
        {field("block", t.block, "ltr")}
        {field("location", t.location)}
        {field("landUse", t.landUse)}
        {field("statedAreaSqm", t.statedArea, "ltr")}
        <label className="a-field"><span>{t.crs}</span>
          <select value={crs} onChange={(e) => setCrs(e.target.value as CrsKey)}>{CRS_OPTIONS.map((c) => <option key={c} value={c}>{t.crsNames[c]}</option>)}</select></label>
      </div>
      <table className="a-table a-points">
        <thead><tr><th>{t.point}</th><th>{t.easting}</th><th>{t.northing}</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><input value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={t.point} dir="ltr" /></td>
              <td><input value={r.e} inputMode="decimal" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, e: e.target.value } : x)))} aria-label={t.easting} dir="ltr" placeholder="641109.78" /></td>
              <td><input value={r.n} inputMode="decimal" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)))} aria-label={t.northing} dir="ltr" placeholder="2609295.15" /></td>
              <td><button type="button" className="a-btn small danger" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={t.removePoint}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="a-btn small" onClick={() => setRows([...rows, { label: String(rows.length + 1), e: "", n: "" }])}>+ {t.addPoint}</button>
      {geo ? (
        <p className={diff !== null && Math.abs(diff) > 3 ? "a-warn" : "a-muted"}>
          {t.computed}: <strong dir="ltr">{geo.areaSqm.toLocaleString("en")} m²</strong>
          {diff !== null && <> · {t.vsStated} <span dir="ltr">{diff > 0 ? "+" : ""}{diff}%</span>{Math.abs(diff) > 3 && ` — ${t.areaWarning}`}</>}
          <br /><span className="a-muted">{t.sides}: <span dir="ltr">{geo.sides.map((s) => `${s} m`).join(" · ")}</span></span>
        </p>
      ) : <p className="a-muted">{t.needPoints}</p>}
      {datumUnknown && <p className="a-warn">{t.ghostHelp}</p>}
      <PlotPreview polygon={geo?.polygon ?? null} ghost={ghost} />
      <div className="a-grid-fields" style={{ marginTop: 12 }}>
        <label className="a-toggle"><input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />
          <span><strong>{t.public}</strong><small>{t.publicHelp}</small></span></label>
        <label className="a-toggle"><input type="checkbox" checked={useAsLocation} onChange={(e) => setUseAsLocation(e.target.checked)} />
          <span><strong>{t.useAsLocation}</strong><small>{t.useAsLocationHelp}</small></span></label>
      </div>
      <label className="a-field"><span>{t.notes}</span><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} dir="auto" /></label>
      <div className="a-inline" style={{ marginTop: 10 }}>
        <button type="button" className="a-btn primary" disabled={state === "saving" || !geo} onClick={save}>{t.save}</button>
        {initial && (
          <form action={deletePlot} onSubmit={(e) => { if (!confirm(t.removeConfirm)) e.preventDefault(); }}>
            <input type="hidden" name="propertyId" value={propertyId} /><button className="a-btn small danger">{t.remove}</button></form>
        )}
      </div>
    </section>
  );
}

export type PlotSummary = { propertyId: number; code: string; kind: string; public: boolean; polygon: LngLat[]; areaSqm: number; plotNumber: string | null };

/** All plots for staff: red = on the public map, grey = staff only. Clicking a plot opens its property. */
export function PlotsOverview({ plots }: { plots: PlotSummary[] }) {
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    loadMapLibre().then((ml) => {
      if (!box.current) return;
      map = new ml.Map({ container: box.current, style: mapStyleUrl, center: [58.38, 23.59], zoom: 9, attributionControl: { compact: true } });
      map.addControl(new ml.NavigationControl({ showCompass: false }));
      map.on("load", () => {
        map!.addSource("plots", { type: "geojson", data: { type: "FeatureCollection", features: plots.map((p) => ({ type: "Feature" as const,
          properties: { id: p.propertyId, pub: p.public, label: `${p.code} · ${Math.round(p.areaSqm)} m²` },
          geometry: { type: "Polygon" as const, coordinates: [p.polygon] } })) } });
        const color = ["case", ["get", "pub"], "#b42318", "#5b6b7c"] as unknown as import("maplibre-gl").ExpressionSpecification;
        map!.addLayer({ id: "plots-fill", type: "fill", source: "plots", paint: { "fill-color": color, "fill-opacity": 0.3 } });
        map!.addLayer({ id: "plots-line", type: "line", source: "plots", paint: { "line-color": color, "line-width": 2 } });
        map!.on("click", "plots-fill", (e) => { const id = e.features?.[0]?.properties?.id; if (id) router.push(`/admin/properties/${id}#plot`); });
        map!.on("mouseenter", "plots-fill", () => { map!.getCanvas().style.cursor = "pointer"; });
        map!.on("mouseleave", "plots-fill", () => { map!.getCanvas().style.cursor = ""; });
        const all = plots.flatMap((p) => p.polygon);
        if (all.length) {
          const lngs = all.map((p) => p[0]);
          const lats = all.map((p) => p[1]);
          map!.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60, maxZoom: 16, duration: 0 });
        }
      });
    });
    return () => map?.remove();
  }, [plots, router]);
  return <div ref={box} className="a-plot-map" style={{ height: "min(70vh, 640px)" }} />;
}
