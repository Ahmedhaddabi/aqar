"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState } from "react";

import type { Locale } from "@/lib/config";
import { mapStyleUrl } from "@/lib/config";
import type { Point } from "@/lib/content";
import { loadMapLibre } from "@/lib/format";

/** Small location map, loaded only when scrolled into view so the project page stays light. */
export function LocationMap({ lang, point, label, loadingText }: {
  lang: Locale; point: Point; label: string; loadingText: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      try {
        const ml = await loadMapLibre();
        if (cancelled) return;
        map = new ml.Map({ container: el, style: mapStyleUrl, center: point, zoom: 14.5, cooperativeGestures: true,
          attributionControl: { compact: true } });
        map.addControl(new ml.NavigationControl({ showCompass: false }), lang === "ar" ? "bottom-left" : "bottom-right");
        const pin = document.createElement("div");
        pin.className = "map-pin project active";
        pin.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5l7-3v19M11 21V9l9 3v9M2 21h20M7 8h1M7 12h1M7 16h1M14 14h2M14 17h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
        new ml.Marker({ element: pin, anchor: "bottom" }).setLngLat(point).addTo(map);
        map.on("load", () => setReady(true));
      } catch {
        /* the "view on the property map" link and the area name remain */
      }
    }, { rootMargin: "200px" });
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
      map?.remove();
    };
  }, [lang, point]);

  return (
    <div className="location-map">
      <div ref={container} className="location-canvas" role="region" aria-label={label} />
      {!ready && <p className="map-status">{loadingText}</p>}
    </div>
  );
}
