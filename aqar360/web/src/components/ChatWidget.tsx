"use client";

import { useEffect, useRef, useState } from "react";

import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";

type Turn = { role: "user" | "assistant"; content: string };
const KEY = "aqar_chat";

function load(): { id: string; turns: Turn[] } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (saved?.id && Array.isArray(saved.turns)) return saved;
  } catch { /* storage blocked: start fresh */ }
  return { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`, turns: [] };
}

/** Links in replies become clickable; everything else stays plain text (no HTML from the model is ever rendered). */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return <>{parts.map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target={p.startsWith(window.location.origin) ? undefined : "_blank"} rel="noreferrer">{p}</a> : p))}</>;
}

/** The website assistant: a button in the corner that opens a small chat panel. */
export function ChatWidget({ lang, t }: { lang: Locale; t: Dictionary["chat"] }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ id: string; turns: Turn[] }>({ id: "", turns: [] });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => setState(load()), []);
  useEffect(() => {
    try { if (state.id) sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [state, open]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || busy) return;
    const turns: Turn[] = [...state.turns, { role: "user" as const, content }].slice(-30);
    setState({ ...state, turns });
    setText("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.id, lang, messages: turns }) });
      const json = await res.json().catch(() => null);
      const reply = res.ok && json?.ok ? String(json.data.reply) : t.error;
      setState((s) => ({ ...s, turns: [...turns, { role: "assistant", content: reply }] }));
    } catch {
      setState((s) => ({ ...s, turns: [...turns, { role: "assistant", content: t.error }] }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat" data-open={open}>
      {open && (
        <section className="chat-panel" role="dialog" aria-label={t.title}>
          <header><strong>✨ {t.title}</strong><button type="button" onClick={() => setOpen(false)} aria-label={t.close}>✕</button></header>
          <div className="chat-list" ref={list} aria-live="polite">
            <p className="chat-msg assistant">{t.hello}</p>
            {state.turns.map((m, i) => <p key={i} className={`chat-msg ${m.role}`} dir="auto"><Linked text={m.content} /></p>)}
            {busy && <p className="chat-msg assistant chat-typing">{t.typing}</p>}
          </div>
          <form onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.placeholder} aria-label={t.placeholder} maxLength={1500} dir="auto" />
            <button className="btn primary" disabled={busy || !text.trim()}>{t.send}</button>
          </form>
          <small className="chat-note">{t.note}</small>
        </section>
      )}
      <button type="button" className="chat-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "✕" : `💬 ${t.open}`}</button>
    </div>
  );
}
