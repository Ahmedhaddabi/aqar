"use client";

import { useEffect, useState } from "react";

import { checkIn } from "@/app/admin/field-actions";

/** Records arrival with the phone's location (asks permission once); still records the time if location is refused. */
export function CheckInButton({ activityId, label, done }: { activityId: number; label: string; done: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const send = async (pos?: GeolocationPosition) => {
    const r = await checkIn({ activityId, lat: pos?.coords.latitude, lng: pos?.coords.longitude, accuracy: pos?.coords.accuracy });
    setState(r.ok ? "done" : "idle");
  };
  if (state === "done") return <span className="a-ok-text">✓ {done}</span>;
  return (
    <button type="button" className="a-btn f-btn" disabled={state === "busy"} onClick={() => {
      setState("busy");
      if (!navigator.geolocation) return void send();
      navigator.geolocation.getCurrentPosition((p) => void send(p), () => void send(), { enableHighAccuracy: true, timeout: 10_000 });
    }}>📍 {label}</button>
  );
}

/** "Add to home screen" hint: shows the browser's install prompt where supported (Android/desktop Chrome). */
export function InstallHint({ text, button }: { text: string; button: string }) {
  const [prompt, setPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as Event & { prompt: () => Promise<void> }); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return (
    <p className="a-muted f-install">📱 {text}{prompt && <> <button type="button" className="a-btn small primary" onClick={() => prompt.prompt()}>{button}</button></>}</p>
  );
}
