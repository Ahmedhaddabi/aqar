"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { aiAsk, aiCustomerSummary, aiDescribeProperty, aiDraftReply, aiExtractRequest, aiReadId } from "@/app/admin/ai-actions";

import type { AdminDict } from "./i18n";

type T = AdminDict["ai"];
const errorText = (t: T, e: string) => (e === "off" ? t.off : e === "limit" ? t.limit : t.failed);

function setField(form: HTMLFormElement, name: string, value: string | number | null | undefined) {
  if (value == null || value === "") return;
  const el = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!el || el.type === "radio" || el.type === "checkbox") return;
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set?.call(el, String(value));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** New request: paste a WhatsApp/chat message, AI fills the form below; staff review before saving. */
export function FillFromMessage({ t }: { t: T }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  const box = useRef<HTMLDivElement>(null);
  const run = async () => {
    setState("busy");
    const r = await aiExtractRequest(text);
    if (!r.ok) return setState(errorText(t, r.error));
    const form = box.current?.closest("main")?.querySelector<HTMLFormElement>("form.a-listing-form");
    if (!form) return setState(t.failed);
    const d = r.data;
    setField(form, "name", d.name); setField(form, "phone", d.phone); setField(form, "email", d.email); setField(form, "language", d.language);
    setField(form, "subtype", d.subtype); setField(form, "propertyType", d.propertyType); setField(form, "budgetMin", d.budgetMin);
    setField(form, "budgetMax", d.budgetMax); setField(form, "bedrooms", d.bedrooms); setField(form, "timing", d.timing); setField(form, "notes", d.notes);
    form.querySelectorAll<HTMLInputElement>('[name="kind"]').forEach((el) => { el.checked = el.value === d.kind; });
    form.querySelectorAll<HTMLInputElement>('[name="areas"]').forEach((el) => { el.checked = d.areaIds.includes(Number(el.value)); });
    setState("done");
  };
  return (
    <div ref={box} className="a-panel a-ai">
      <h2>✨ {t.fillTitle}</h2>
      <p className="a-muted">{t.fillIntro}</p>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} dir="auto" aria-label={t.fillTitle} placeholder={t.fillPlaceholder} />
      <div className="a-inline" style={{ marginTop: 8 }}>
        <button type="button" className="a-btn primary" disabled={state === "busy" || text.trim().length < 5} onClick={run}>
          {state === "busy" ? t.working : `✨ ${t.fill}`}</button>
        {state === "done" && <span className="a-ok-text">✓ {t.filled}</span>}
        {!["idle", "busy", "done"].includes(state) && <span className="a-error">{state}</span>}
      </div>
    </div>
  );
}

/** Property editor: draft both descriptions from the facts typed in the form (staff edit before saving). */
export function DescribeButton({ t }: { t: T }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  const btn = useRef<HTMLButtonElement>(null);
  const run = async () => {
    const form = btn.current?.closest("form");
    if (!form) return;
    setState("busy");
    const facts = Object.fromEntries([...new FormData(form).entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)]));
    const r = await aiDescribeProperty(facts);
    if (!r.ok) return setState(errorText(t, r.error));
    setField(form, "descriptionAr", r.data.ar);
    setField(form, "descriptionEn", r.data.en);
    setState("done");
  };
  return (
    <span className="a-inline">
      <button ref={btn} type="button" className="a-btn small" disabled={state === "busy"} onClick={run}>{state === "busy" ? t.working : `✨ ${t.describe}`}</button>
      {state === "done" && <span className="a-ok-text">✓ {t.described}</span>}
      {!["idle", "busy", "done"].includes(state) && <span className="a-error">{state}</span>}
    </span>
  );
}

/** Chat with the staff assistant; record paths in answers become links. */
export function AssistantChat({ t, examples }: { t: T; examples: string[] }) {
  const [turns, setTurns] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    const next = [...turns, { role: "user" as const, content: q.trim() }];
    setTurns(next); setText(""); setBusy(true); setError("");
    const r = await aiAsk(next);
    setBusy(false);
    if (!r.ok) return setError(errorText(t, r.error));
    setTurns([...next, { role: "assistant", content: r.data }]);
  };
  const render = (s: string) => s.split(/(\/admin\/[a-z-]+\/\d+)/g).map((part, i) =>
    /^\/admin\/[a-z-]+\/\d+$/.test(part) ? <Link key={i} href={part}>{part.split("/").slice(-2).join(" #")}</Link> : <span key={i}>{part}</span>);
  return (
    <div className="a-chat">
      {turns.length === 0 && (
        <div className="a-inline">{examples.map((e) => <button key={e} type="button" className="a-btn small" onClick={() => ask(e)}>{e}</button>)}</div>
      )}
      {turns.map((m, i) => <div key={i} className={`a-chat-msg ${m.role}`} dir="auto">{m.role === "assistant" ? render(m.content) : m.content}</div>)}
      {busy && <div className="a-chat-msg assistant a-muted">{t.thinking}</div>}
      {error && <p className="a-error">{error}</p>}
      <form className="a-inline a-chat-form" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.askPlaceholder} aria-label={t.askPlaceholder} dir="auto" />
        <button className="a-btn primary" disabled={busy}>{t.send}</button>
      </form>
    </div>
  );
}

/** WhatsApp reply box: "✨ Draft reply" fills the text for staff to edit; the form (a server action) sends and clears it. */
export function WaComposer({ t, contactId, placeholder, sendLabel, ai }: { t: T; contactId: number; placeholder: string; sendLabel: string; ai: boolean }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  const run = async () => {
    setState("busy");
    const r = await aiDraftReply(contactId);
    if (!r.ok) return setState(errorText(t, r.error));
    if (box.current) { box.current.value = r.data; box.current.focus(); }
    setState("done");
  };
  return (
    <div className="a-wa-composer">
      <textarea ref={box} name="text" rows={3} required dir="auto" placeholder={placeholder} aria-label={placeholder} />
      <div className="a-inline">
        <button className="a-btn primary">{sendLabel}</button>
        {ai && <button type="button" className="a-btn" disabled={state === "busy"} onClick={run}>{state === "busy" ? t.working : `✨ ${t.draft}`}</button>}
        {state === "done" && <span className="a-ok-text">✓ {t.drafted}</span>}
        {!["idle", "busy", "done"].includes(state) && <span className="a-error">{state}</span>}
      </div>
    </div>
  );
}

/** "✨ Summary": one or two lines about the customer, on demand (each click is one AI call). */
export function CustomerSummary({ t, contactId }: { t: T; contactId: number }) {
  const [state, setState] = useState<"idle" | "busy" | string>("idle");
  const [text, setText] = useState("");
  const run = async () => {
    setState("busy");
    const r = await aiCustomerSummary(contactId);
    if (!r.ok) return setState(errorText(t, r.error));
    setText(r.data);
    setState("idle");
  };
  return (
    <div className="a-ai-summary">
      <button type="button" className="a-btn small" disabled={state === "busy"} onClick={run}>{state === "busy" ? t.working : `✨ ${t.summary}`}</button>
      {text && <p dir="auto">{text}</p>}
      {!["idle", "busy"].includes(state) && <span className="a-error">{state}</span>}
    </div>
  );
}

/** Phone photos are large: shrink to at most 1600 px as JPEG before upload (faster, cheaper, enough to read). */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
}

/** "Read ID card / passport": takes or picks a photo, fills name, ID number, nationality and expiry in the form around it. */
export function IdScan({ t }: { t: T }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  const run = async (file: File | undefined) => {
    if (!file) return;
    setState("busy");
    try {
      const data = new FormData();
      data.append("photo", new File([await shrink(file)], "id.jpg", { type: "image/jpeg" }));
      const r = await aiReadId(data);
      if (!r.ok) return setState(r.error === "failed" ? t.idFailed : errorText(t, r.error));
      const form = box.current?.closest("form");
      if (!form) return setState(t.failed);
      setField(form, "name", r.data.fullName); setField(form, "idNumber", r.data.idNumber);
      setField(form, "nationality", r.data.nationality); setField(form, "idExpiry", r.data.expiryDate);
      setState("done");
    } catch {
      setState(t.idFailed);
    }
  };
  return (
    <div ref={box} className="a-inline a-idscan">
      <label className="a-btn small">
        {state === "busy" ? t.working : `🪪 ${t.readId}`}
        <input type="file" accept="image/*" capture="environment" hidden disabled={state === "busy"} onChange={(e) => { void run(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {state === "done" && <span className="a-ok-text">✓ {t.idRead}</span>}
      {!["idle", "busy", "done"].includes(state) && <span className="a-error">{state}</span>}
      <small className="a-muted">{t.idPrivacy}</small>
    </div>
  );
}
