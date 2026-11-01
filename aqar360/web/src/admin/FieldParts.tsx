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
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("ops")) req.result.createObjectStore("ops", { keyPath: "id" });
      if (!req.result.objectStoreNames.contains("photos")) req.result.createObjectStore("photos", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function store<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>, name: "ops" | "photos" = "ops"): Promise<T> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(name, mode).objectStore(name));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const queued = () => store<Op[]>("readonly", (s) => s.getAll() as IDBRequest<Op[]>).then((ops) => ops.sort((a, b) => a.at.localeCompare(b.at)));
type QueuedPhoto = { id: string; activityId: number; at: string; blob: Blob };
const queuedPhotos = () => store<QueuedPhoto[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedPhoto[]>, "photos");
const waitingCount = async () => (await queued()).length + (await queuedPhotos()).length;
const newId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

let flushing: Promise<"sent" | "offline" | "signin"> | null = null;
/** Sends everything waiting, oldest first; keeps it on the phone if there is no signal or the person must sign in again. */
export function flush(): Promise<"sent" | "offline" | "signin"> {
  flushing ??= (async () => {
    try {
      const ops = await queued();
      const photos = await queuedPhotos();
      if (!ops.length && !photos.length) return "sent" as const;
      if (!navigator.onLine) return "offline" as const;
      if (ops.length) {
        const res = await fetch("/api/field/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops: ops.slice(0, 50) }) });
        if (res.status === 401) return "signin" as const;
        if (!res.ok) return "offline" as const;
        const results: Record<string, string> = (await res.json()).data.results;
        for (const id of Object.keys(results)) await store("readwrite", (s) => s.delete(id));
      }
      // Photos one by one (each under the upload limit); a failure keeps the rest for next time.
      for (const p of photos) {
        const data = new FormData();
        data.append("id", p.id);
        data.append("activityId", String(p.activityId));
        data.append("at", p.at);
        data.append("file", new File([p.blob], `${p.id}.jpg`, { type: "image/jpeg" }));
        const res = await fetch("/api/field/photo", { method: "POST", body: data });
        if (res.status === 401) return "signin" as const;
        if (!res.ok) return "offline" as const;
        await store("readwrite", (s) => s.delete(p.id), "photos");
      }
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
    const count = () => waitingCount().then(setWaiting).catch(() => undefined);
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

/** Phone photos are large: shrink to at most 1600 px JPEG before keeping them on the phone. */
async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
}

/** Photos at the visit (offline too): kept on the phone, then saved in the request's documents. */
export function PhotoButton({ activityId, label, saved }: { activityId: number; label: string; saved: string }) {
  const [n, setN] = useState(0);
  const add = async (files: FileList | null) => {
    for (const file of Array.from(files ?? []).slice(0, 10)) {
      const blob = await shrinkPhoto(file).catch(() => file);
      await store("readwrite", (s) => s.put({ id: newId(), activityId, at: new Date().toISOString(), blob }), "photos");
      setN((x) => x + 1);
    }
    window.dispatchEvent(new Event(EVENT));
    void flush();
  };
  return (
    <label className="a-btn f-btn">📷 {label}{n > 0 && ` · ${n} ${saved}`}
      <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { void add(e.target.files); e.target.value = ""; }} /></label>
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
