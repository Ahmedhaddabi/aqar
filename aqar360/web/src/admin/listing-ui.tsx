"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useRouter } from "next/navigation";
import { type ReactNode, useActionState, useEffect, useRef, useState } from "react";

import type { FormState } from "@/app/admin/actions";
import { saveProject, saveProperty, uploadPhoto } from "@/app/admin/listing-actions";
import { mapStyleUrl } from "@/lib/config";
import { loadMapLibre } from "@/lib/format";
import { coordsFromLink } from "@/lib/text";

import type { AdminDict } from "./i18n";

type T = AdminDict["listings"];

/** Wraps a server-rendered form: saves through the action, shows "saved", highlights fields to check. */
export function ListingForm({ kind, t, checkText, children }: { kind: "project" | "property"; t: T; checkText: string; children: ReactNode }) {
  const [state, action, pending] = useActionState<FormState, FormData>(kind === "project" ? saveProject : saveProperty, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    form.querySelectorAll(".a-field.invalid").forEach((el) => el.classList.remove("invalid"));
    for (const name of Object.keys(state.fields ?? {})) form.querySelector(`[name="${name}"]`)?.closest(".a-field")?.classList.add("invalid");
  }, [state]);
  return (
    <form ref={ref} action={action} className="a-form a-listing-form">
      {children}
      <div className="a-savebar">
        {state.ok && <span className="a-ok-text" role="status">{t.saved}</span>}
        {state.error && <span className="a-error" role="alert">{checkText}</span>}
        <button className="a-btn primary" disabled={pending}>{t.save}</button>
      </div>
    </form>
  );
}

const MUSCAT: [number, number] = [58.38, 23.59];

/** Click to place the pin; or paste a Google Maps link. Writes hidden lat/lng inputs. */
export function MapPicker({ lat, lng, t }: { lat: number | null; lng: number | null; t: T }) {
  const [point, setPoint] = useState<[number, number] | null>(lat != null && lng != null ? [lat, lng] : null);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState(false);
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
      map = new ml.Map({ container: container.current, style: mapStyleUrl, center: point ? [point[1], point[0]] : MUSCAT,
        zoom: point ? 15 : 10, attributionControl: { compact: true } });
      map.addControl(new ml.NavigationControl({ showCompass: false }));
      map.on("click", (e) => setPoint([Number(e.lngLat.lat.toFixed(6)), Number(e.lngLat.lng.toFixed(6))]));
      mapRef.current = map;
      if (point) markerRef.current = new ml.Marker({ color: "#0e7c7b" }).setLngLat([point[1], point[0]]).addTo(map);
    });
    return () => { cancelled = true; map?.remove(); };
    // The map is created once; pin changes are applied below.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const ml = libRef.current;
    if (!map || !ml) return;
    markerRef.current?.remove();
    markerRef.current = point ? new ml.Marker({ color: "#0e7c7b" }).setLngLat([point[1], point[0]]).addTo(map) : null;
  }, [point]);

  const useLink = () => {
    const coords = coordsFromLink(link);
    setLinkError(!coords);
    if (coords) {
      setPoint(coords);
      mapRef.current?.flyTo({ center: [coords[1], coords[0]], zoom: 15 });
    }
  };
  return (
    <div className="a-mappicker">
      <p className="a-muted">{t.mapHelp}</p>
      <div className="a-inline">
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={t.mapLink} aria-label={t.mapLink} dir="ltr" />
        <button type="button" className="a-btn small" onClick={useLink}>{t.useLink}</button>
        {point && <button type="button" className="a-btn small" onClick={() => setPoint(null)}>{t.clearPin}</button>}
      </div>
      {linkError && <p className="a-error">{t.linkFailed}</p>}
      <div ref={container} className="a-map" />
      <input type="hidden" name="lat" value={point ? point[0] : ""} />
      <input type="hidden" name="lng" value={point ? point[1] : ""} />
      {point && <p className="a-muted" dir="ltr">{point[0]}, {point[1]}</p>}
    </div>
  );
}

type UnitTypeRow = { type: string; bedrooms: string; sizeFrom: string; sizeTo: string; priceFrom: string; priceTo: string; available: string };
const UNIT_TYPES = ["Studio", "1 Bedroom", "2 Bedrooms", "3 Bedrooms", "4 Bedrooms", "5+ Bedrooms", "Townhouse", "Villa", "Penthouse",
  "Office", "Shop", "Showroom", "Warehouse", "Land Plot"];

/** Editable table of unit types; sent as JSON in one hidden field. */
export function UnitTypesEditor({ initial, t }: { initial: UnitTypeRow[]; t: T }) {
  const [rows, setRows] = useState<UnitTypeRow[]>(initial);
  const empty: UnitTypeRow = { type: "", bedrooms: "", sizeFrom: "", sizeTo: "", priceFrom: "", priceTo: "", available: "" };
  const set = (i: number, key: keyof UnitTypeRow, value: string) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [key]: value } : row)));
  const columns: [keyof UnitTypeRow, string, string][] = [["bedrooms", t.bedrooms, "number"], ["sizeFrom", t.sizeFrom, "number"],
    ["sizeTo", t.sizeTo, "number"], ["priceFrom", t.priceFrom, "number"], ["priceTo", t.priceTo, "number"], ["available", t.available, "number"]];
  return (
    <div>
      <datalist id="unit-types">{UNIT_TYPES.map((u) => <option key={u} value={u} />)}</datalist>
      <div className="a-rows">
        {rows.map((row, i) => (
          <div className="a-row-edit" key={i}>
            <label className="a-field"><span>{t.unitType}</span>
              <input list="unit-types" value={row.type} onChange={(e) => set(i, "type", e.target.value)} required dir="auto" /></label>
            {columns.map(([key, label, type]) => (
              <label className="a-field" key={key}><span>{label}</span>
                <input type={type} min={0} value={row[key]} onChange={(e) => set(i, key, e.target.value)} /></label>
            ))}
            <button type="button" className="a-btn small danger" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>{t.removeRow}</button>
          </div>
        ))}
      </div>
      <button type="button" className="a-btn small" onClick={() => setRows((r) => [...r, empty])}>+ {t.addRow}</button>
      <input type="hidden" name="unitTypes" value={JSON.stringify(rows.filter((r) => r.type.trim()))} />
    </div>
  );
}

/** Shrinks a photo in the browser (max 1920 px, JPEG) so uploads stay small and fast on mobile data. */
export async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("shrink failed");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

export function PhotoUploader({ ownerType, ownerId, t }: { ownerType: "project" | "property"; ownerId: number; t: T }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    let failed: string | null = null;
    for (const [i, file] of [...files].slice(0, 12).entries()) {
      setBusy(`${i + 1} / ${Math.min(files.length, 12)}`);
      try {
        const form = new FormData();
        form.set("ownerType", ownerType);
        form.set("ownerId", String(ownerId));
        form.set("photo", await shrink(file));
        const result = await uploadPhoto(form);
        if (!result.ok) failed = result.error === "storage" ? t.storageMissing : t.photoError;
      } catch {
        failed = t.photoError;
      }
    }
    setBusy(null);
    setError(failed);
    router.refresh();
  };
  return (
    <div className="a-uploader">
      <label className="a-btn primary">
        {busy ? `… ${busy}` : t.upload}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={!!busy}
          onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      </label>
      <p className="a-muted">{t.photosHelp}</p>
      {error && <p className="a-error" role="alert">{error}</p>}
    </div>
  );
}
