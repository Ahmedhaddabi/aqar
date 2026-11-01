"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { FieldOp } from "@/lib/field-sync";

// ---- Offline queue: actions are kept on the phone (IndexedDB) and sent when there is signal -------------------------
type Op = FieldOp;
/** Omit applied to each kind of action separately (a plain Omit would mix their fields). */
type Each<T> = T extends unknown ? Omit<T, "id" | "at"> : never;
type NewOp = Each<Op>;
const DB = "aqar-field";
const EVENT = "aqar-field-queue";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("ops", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function store<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction("ops", mode).objectStore("ops"));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const queued = () => store<Op[]>("readonly", (s) => s.getAll() as IDBRequest<Op[]>).then((ops) => ops.sort((a, b) => a.at.localeCompare(b.at)));
const newId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

let flushing: Promise<"sent" | "offline" | "signin"> | null = null;
/** Sends everything waiting, oldest first; keeps it on the phone if there is no signal or the person must sign in again. */
export function flush(): Promise<"sent" | "offline" | "signin"> {
  flushing ??= (async () => {
    try {
      const ops = await queued();
      if (!ops.length) return "sent" as const;
      if (!navigator.onLine) return "offline" as const;
      const res = await fetch("/api/field/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops: ops.slice(0, 50) }) });
      if (res.status === 401) return "signin" as const;
      if (!res.ok) return "offline" as const;
      const results: Record<string, string> = (await res.json()).data.results;
      for (const id of Object.keys(results)) await store("readwrite", (s) => s.delete(id));
      return "sent" as const;
    } catch {
      return "offline" as const;
    } finally {
      window.dispatchEvent(new Event(EVENT));
      flushing = null;
    }
  })();
  return flushing;
}

async function record(op: NewOp) {
  await store("readwrite", (s) => s.put({ ...op, id: newId(), at: new Date().toISOString() } as Op));
  window.dispatchEvent(new Event(EVENT));
  return flush();
}

/** Signal / waiting banner, service worker registration (keeps the last list for offline) and sending on reconnect. */
export function FieldSync({ t }: { t: { offline: string; waiting: string; signin: string; sent: string } }) {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);
  const [signin, setSignin] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/field-sw.js", { scope: "/admin/field" }).catch(() => undefined);
    const count = () => queued().then((ops) => setWaiting(ops.length)).catch(() => undefined);
    const send = () => flush().then((r) => { setSignin(r === "signin"); if (r === "sent") router.refresh(); });
    const up = () => { setOnline(true); void send(); };
    const down = () => setOnline(false);
    setOnline(navigator.onLine);
    void count();
    void send();
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    window.addEventListener(EVENT, count);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); window.removeEventListener(EVENT, count); };
  }, [router]);
  if (signin) return <p className="a-alert f-sync">{t.signin}</p>;
  if (online && !waiting) return null;
  return <p className={`f-sync ${online ? "a-warn" : "a-alert"}`}>{online ? "⏳" : "📵"} {online ? "" : `${t.offline} `}{waiting ? t.waiting.replace("{n}", String(waiting)) : ""}</p>;
}

/** Records arrival with the phone's location (asks permission once); still records the time if location is refused. Works offline. */
export function CheckInButton({ activityId, label, done, saved }: { activityId: number; label: string; done: string; saved: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "saved">("idle");
  const send = async (pos?: GeolocationPosition) => {
    const r = await record({ type: "checkin", activityId, lat: pos?.coords.latitude, lng: pos?.coords.longitude, accuracy: pos?.coords.accuracy });
    setState(r === "sent" ? "done" : "saved");
  };
  if (state === "done" || state === "saved") return <span className="a-ok-text">✓ {state === "done" ? done : saved}</span>;
  return (
    <button type="button" className="a-btn f-btn" disabled={state === "busy"} onClick={() => {
      setState("busy");
      if (!navigator.geolocation) return void send();
      navigator.geolocation.getCurrentPosition((p) => void send(p), () => void send(), { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 });
    }}>📍 {label}</button>
  );
}

const RESULTS = ["interested", "not_suitable", "wants_alternatives", "no_show"] as const;

/** Viewing result in one tap (offline too). */
export function ResultButtons({ activityId, labels, saved }: { activityId: number; labels: Record<string, string>; saved: string }) {
  const [chosen, setChosen] = useState<string | null>(null);
  if (chosen) return <span className="a-ok-text">✓ {labels[chosen]} · {saved}</span>;
  return (
    <>
      {RESULTS.map((r) => (
        <button key={r} type="button" className="a-btn small" onClick={() => { setChosen(r); void record({ type: "result", activityId, result: r }); }}>{labels[r]}</button>
      ))}
    </>
  );
}

/** A quick note on the visit (offline too). */
export function QuickNote({ activityId, placeholder, button, saved }: { activityId: number; placeholder: string; button: string; saved: string }) {
  const [text, setText] = useState("");
  const [ok, setOk] = useState(false);
  return (
    <form className="f-note" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; void record({ type: "note", activityId, text: text.trim() }); setText(""); setOk(true); }}>
      <input value={text} onChange={(e) => { setText(e.target.value); setOk(false); }} placeholder={placeholder} aria-label={placeholder} dir="auto" maxLength={2000} />
      <button className="a-btn small">{button}</button>
      {ok && <span className="a-ok-text">✓ {saved}</span>}
    </form>
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
