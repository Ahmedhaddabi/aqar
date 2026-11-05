"use client";

import { useState } from "react";

import type { OpenRouterModel } from "@/lib/integrations";

type Text = { search: string; shown: string; none: string; free: string; varies: string; gone: string; priceHelp: string };

/** Scrolling list of OpenRouter's models. The chosen one comes first; rows filtered out stay in the form, so it is always sent. */
export function ModelPicker({ name, value, models, t }: { name: string; value: string; models: OpenRouterModel[]; t: Text }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const chosen = models.find((m) => m.id === value);
  const rows = [chosen ?? { id: value, name: value, input: null, output: null }, ...models.filter((m) => m.id !== value)];
  const matches = (m: OpenRouterModel) => !needle || `${m.name} ${m.id}`.toLowerCase().includes(needle);
  const price = (m: OpenRouterModel) => {
    if (m.input === 0 && m.output === 0) return <span className="a-tag">{t.free}</span>;
    if (m.input === null || m.output === null) return t.varies;
    return <span dir="ltr" title={t.priceHelp}>${m.input} / ${m.output}</span>;
  };
  return (
    <>
      <div className="a-models-head">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} dir="auto" spellCheck={false}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
        <small>{t.shown.replace("{n}", String(rows.filter(matches).length)).replace("{total}", String(rows.length))}</small>
      </div>
      <div className="a-models" role="radiogroup" tabIndex={0}>
        {rows.map((m) => (
          <label key={m.id} className="a-model" hidden={!matches(m)}>
            <input type="radio" name={name} value={m.id} defaultChecked={m.id === value} />
            <span className="a-model-name" dir="ltr"><strong>{m.name}</strong><small>{m.id}</small></span>
            <span className="a-model-price">{chosen || m.id !== value ? price(m) : <span className="a-tag a-saved">{t.gone}</span>}</span>
          </label>
        ))}
        {!rows.some(matches) && <p className="a-models-none">{t.none}</p>}
      </div>
    </>
  );
}
