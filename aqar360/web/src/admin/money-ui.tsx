"use client";

import { useState } from "react";

import { uploadReceipt } from "@/app/admin/money-actions";

import type { AdminDict } from "./i18n";
import { shrink } from "./listing-ui";

type T = AdminDict["money"];
type Line = { description: string; qty: string; unitPrice: string; serviceCode: string | null; passThrough: boolean };
type ServiceOption = { code: string; name: string; price: number | null };

/** Invoice lines: pick a service (fills name and price) or type a free line; totals update as you type. */
export function LinesEditor({ t, services, lang }: { t: T; services: ServiceOption[]; lang: "ar" | "en" }) {
  const [lines, setLines] = useState<Line[]>([{ description: "", qty: "1", unitPrice: "", serviceCode: null, passThrough: false }]);
  const set = (i: number, patch: Partial<Line>) => setLines((rows) => rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const fmt = new Intl.NumberFormat(lang === "ar" ? "ar-OM-u-nu-latn" : "en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const total = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const addService = (code: string) => {
    const s = services.find((x) => x.code === code);
    if (s) setLines((rows) => [...rows.filter((r) => r.description || r.unitPrice), { description: s.name, qty: "1",
      unitPrice: s.price ? String(s.price) : "", serviceCode: s.code, passThrough: false }]);
  };
  return (
    <div className="a-lines">
      <div className="a-inline">
        <select onChange={(e) => { addService(e.target.value); e.target.value = ""; }} defaultValue="" aria-label={t.addService}>
          <option value="">+ {t.addService}</option>
          {services.map((s) => <option key={s.code} value={s.code}>{s.name}{s.price ? ` — ${s.price}` : ""}</option>)}
        </select>
        <button type="button" className="a-btn small" onClick={() => setLines((r) => [...r, { description: "", qty: "1", unitPrice: "",
          serviceCode: null, passThrough: false }])}>+ {t.addLine}</button>
      </div>
      {lines.map((l, i) => (
        <div className="a-line" key={i}>
          <label className="a-field"><span>{t.description}</span>
            <input value={l.description} onChange={(e) => set(i, { description: e.target.value })} required dir="auto" /></label>
          <label className="a-field"><span>{t.qty}</span>
            <input type="number" min={0} step="any" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} required /></label>
          <label className="a-field"><span>{t.unitPrice}</span>
            <input type="number" min={0} step="0.001" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} required /></label>
          <span className="a-line-total">{fmt.format((Number(l.qty) || 0) * (Number(l.unitPrice) || 0))}</span>
          <label className="a-check"><input type="checkbox" checked={l.passThrough} onChange={(e) => set(i, { passThrough: e.target.checked })} /> {t.passThrough}</label>
          {lines.length > 1 && <button type="button" className="a-btn small danger" onClick={() => setLines((r) => r.filter((_, j) => j !== i))}>×</button>}
        </div>
      ))}
      <p className="a-total">{t.total}: <strong>{fmt.format(total)} {lang === "ar" ? "ر.ع" : "OMR"}</strong></p>
      <input type="hidden" name="lines" value={JSON.stringify(lines.filter((l) => l.description.trim()).map((l) => ({
        description: l.description, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0, serviceCode: l.serviceCode, passThrough: l.passThrough })))} />
    </div>
  );
}

/** Receipt photo: shrunk in the browser, uploaded, then its address goes with the expense form. */
/** `upload` lets other screens (expense claims) use their own server action with the same behaviour. */
export function ReceiptInput({ t, upload = uploadReceipt }: { t: T; upload?: (form: FormData) => Promise<{ ok: boolean; url?: string }> }) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  return (
    <label className="a-field"><span>{t.receipt}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setState("busy");
        try {
          const form = new FormData();
          form.set("photo", file.type === "application/pdf" ? file : await shrink(file));
          const result = await upload(form);
          setUrl(result.url ?? "");
          setState(result.ok ? "idle" : "error");
        } catch { setState("error"); }
      }} />
      {state === "busy" && <small>…</small>}
      {url && <small>✓</small>}
      {state === "error" && <small className="a-error">!</small>}
      <input type="hidden" name="receiptUrl" value={url} />
    </label>
  );
}
