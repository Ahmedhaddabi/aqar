"use client";

import { useEffect, useState } from "react";

import type { Dictionary } from "@/i18n/dictionaries";
import { captureAttribution } from "@/lib/analytics";

const CONSENT_KEY = "aqar_analytics_consent";

function loadGtm(id: string) {
  if (document.getElementById("aqar-gtm")) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const script = document.createElement("script");
  script.id = "aqar-gtm";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

/** Records first-touch attribution and loads Google Tag Manager only after consent (§12, §20). */
export function Analytics({ gtmId, dict }: { gtmId: string; dict: Dictionary["consent"] }) {
  const [choice, setChoice] = useState<string | null>("pending");

  useEffect(() => {
    captureAttribution();
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(CONSENT_KEY);
    } catch {
      /* storage blocked: ask again next visit */
    }
    setChoice(stored);
    if (stored === "granted" && gtmId) loadGtm(gtmId);
  }, [gtmId]);

  if (!gtmId || choice !== null) return null;

  const decide = (value: "granted" | "denied") => {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      /* ignore */
    }
    setChoice(value);
    if (value === "granted") loadGtm(gtmId);
  };

  return (
    <div className="consent" role="dialog" aria-live="polite">
      <span>{dict.text}</span>
      <div className="actions">
        <button className="btn primary" onClick={() => decide("granted")}>{dict.accept}</button>
        <button className="btn secondary" onClick={() => decide("denied")}>{dict.decline}</button>
      </div>
    </div>
  );
}
