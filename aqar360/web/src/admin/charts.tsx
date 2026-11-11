// Small hand-built charts for the admin (server components, no chart library, no client JavaScript).
// Built with HTML and CSS so they follow the page direction (Arabic reads right to left, time runs from the start side)
// and the light/dark theme. Every chart has a hover/keyboard tooltip and a table view with the same numbers.
// Colours and marks follow one system (admin.css → "Charts"): blue for the main series, orange for the second,
// a one-hue blue ramp for ordered stages; thin bars with rounded ends, 2px lines, hairline grid.
import type { CSSProperties, ReactNode } from "react";

type Lang = "ar" | "en";
const nf = (lang: Lang, opts: Intl.NumberFormatOptions = {}) => new Intl.NumberFormat(lang === "ar" ? "ar-OM-u-nu-latn" : "en-GB", opts);
export const fmt = (v: number, lang: Lang) => nf(lang, { maximumFractionDigits: 0 }).format(v);
/** Axis ticks: in full under 10,000, compact above (12K). */
const tick = (v: number, max: number, lang: Lang) => (max >= 10_000 ? nf(lang, { notation: "compact", maximumFractionDigits: 1 }).format(v) : fmt(v, lang));

/** Clean round ticks from 0 to just above the largest value. */
function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

const pct = (v: number, top: number) => `${Math.max(0, Math.min(100, (v / (top || 1)) * 100))}%`;
const edge = (i: number, n: number) => (n > 4 && i < 2 ? " start" : n > 4 && i >= n - 2 ? " end" : "");

export type Series = { name: string; slot: 1 | 2 };

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="viz-legend">{series.map((s) => <li key={s.name}><i className={`viz-key s${s.slot}`} />{s.name}</li>)}</ul>
  );
}

function TableView({ label, head, rows }: { label: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="viz-table">
      <summary>{label}</summary>
      <table className="a-table"><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>
    </details>
  );
}

/**
 * Columns over time, one or two series side by side (e.g. income and spending per month). One axis, starting at 0.
 * `extra` adds lines to the tooltip only (e.g. profit), so nothing is drawn on a second scale.
 */
export function ColumnChart({ groups, series, lang, unit, tableLabel, height = 200, extra }: {
  groups: { label: string; long?: string; values: number[] }[]; series: Series[]; lang: Lang; unit?: string; tableLabel: string; height?: number;
  extra?: { name: string; values: number[] };
}) {
  const max = Math.max(0, ...groups.flatMap((g) => g.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const every = Math.ceil(groups.length / 12); // x labels: at most about 12
  const u = unit ? ` ${unit}` : "";
  return (
    <figure className="viz" style={{ "--viz-h": `${height}px` } as CSSProperties}>
      <Legend series={series} />
      <div className="viz-plot">
        <div className="viz-grid" aria-hidden>
          {ticks.map((t) => <div key={t} style={{ bottom: pct(t, top) }}><span>{tick(t, top, lang)}</span></div>)}
        </div>
        <div className="viz-cols">
          {groups.map((g, i) => (
            <div key={g.label + i} className={`viz-col${edge(i, groups.length)}`} tabIndex={0}
              aria-label={`${g.long ?? g.label}: ${series.map((s, k) => `${s.name} ${fmt(g.values[k] ?? 0, lang)}${u}`).join(", ")}`}>
              <div className="viz-bars">
                {series.map((s, k) => <div key={s.name} className={`viz-bar s${s.slot}`} style={{ height: pct(g.values[k] ?? 0, top) }} />)}
              </div>
              <span className="viz-x" aria-hidden>{(groups.length - 1 - i) % every === 0 ? g.label : ""}</span>
              <div className="viz-tip" role="tooltip">
                <b>{g.long ?? g.label}</b>
                {series.map((s, k) => <span key={s.name}><i className={`viz-line-key s${s.slot}`} /><strong>{fmt(g.values[k] ?? 0, lang)}{u}</strong> {s.name}</span>)}
                {extra && <span><i className="viz-line-key s0" /><strong>{fmt(extra.values[i] ?? 0, lang)}{u}</strong> {extra.name}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <TableView label={tableLabel} head={["", ...series.map((s) => s.name), ...(extra ? [extra.name] : [])]}
        rows={groups.map((g, i) => [g.long ?? g.label, ...series.map((_, k) => `${fmt(g.values[k] ?? 0, lang)}${u}`), ...(extra ? [`${fmt(extra.values[i] ?? 0, lang)}${u}`] : [])])} />
    </figure>
  );
}

/** One series over time as a line with a light wash, the last value labelled, a crosshair tooltip at every point. */
export function LineChart({ points, lang, name, tableLabel, height = 180 }: {
  points: { label: string; long?: string; value: number }[]; lang: Lang; name: string; tableLabel: string; height?: number;
}) {
  const max = Math.max(0, ...points.map((p) => p.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const n = points.length;
  const x = (i: number) => ((i + 0.5) / Math.max(1, n)) * 100; // the centre of each hover column
  const y = (v: number) => 100 - (v / (top || 1)) * 100;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(" ");
  const last = points[n - 1];
  const every = Math.ceil(n / 8);
  return (
    <figure className="viz" style={{ "--viz-h": `${height}px` } as CSSProperties}>
      <div className="viz-plot">
        <div className="viz-grid" aria-hidden>
          {ticks.map((t) => <div key={t} style={{ bottom: pct(t, top) }}><span>{tick(t, top, lang)}</span></div>)}
        </div>
        <div className="viz-area">
          <svg className="viz-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {n > 1 && <path className="viz-wash" d={`${line} L${x(n - 1).toFixed(2)},100 L${x(0).toFixed(2)},100 Z`} />}
            {n > 1 && <path className="viz-path" d={line} vectorEffect="non-scaling-stroke" />}
          </svg>
          {last && <span className="viz-dot" style={{ insetInlineStart: `${x(n - 1)}%`, bottom: `calc(24px + var(--viz-h) * ${last.value / (top || 1)} - 5px)` }} aria-hidden />}
          {last && <span className="viz-end" style={{ insetInlineStart: `calc(${x(n - 1)}% + 9px)`, bottom: `calc(24px + var(--viz-h) * ${last.value / (top || 1)} - 9px)` }} aria-hidden>{fmt(last.value, lang)}</span>}
          <div className="viz-hits">
            {points.map((p, i) => (
              <div key={p.label + i} className={`viz-hit${edge(i, n)}`} tabIndex={0} aria-label={`${p.long ?? p.label}: ${fmt(p.value, lang)}`}>
                <span className="viz-x" aria-hidden>{(n - 1 - i) % every === 0 ? p.label : ""}</span>
                <div className="viz-tip" role="tooltip"><b>{p.long ?? p.label}</b><span><i className="viz-line-key s1" /><strong>{fmt(p.value, lang)}</strong> {name}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <TableView label={tableLabel} head={["", name]} rows={points.map((p) => [p.long ?? p.label, fmt(p.value, lang)])} />
    </figure>
  );
}

/** Ranked or ordered horizontal bars with the value at the tip. `ordered` shades stages light → dark (a pipeline). */
export function BarList({ rows, lang, ordered, unit }: {
  rows: { label: string; value: number; href?: string }[]; lang: Lang; ordered?: boolean; unit?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <ul className={`viz-hbars${ordered ? " ordered" : ""}`}>
      {rows.map((r, i) => {
        const body: ReactNode = (
          <>
            <span className="viz-hlabel">{r.label}</span>
            <span className="viz-htrack"><span className={`viz-hbar${ordered ? ` o${Math.min(5, Math.round((i / Math.max(1, rows.length - 1)) * 4) + 1)}` : ""}`}
              style={{ width: pct(r.value, max) }} /><span className="viz-hval">{fmt(r.value, lang)}{unit ? ` ${unit}` : ""}</span></span>
          </>
        );
        const title = `${r.label}: ${fmt(r.value, lang)}${unit ? ` ${unit}` : ""}${total ? ` (${Math.round((r.value / total) * 100)}%)` : ""}`;
        return <li key={r.label + i} title={title}>{r.href ? <a href={r.href}>{body}</a> : body}</li>;
      })}
    </ul>
  );
}

/** Stat tile with a sparkline: the number, the change against the period before, and the trend. */
export function StatTile({ label, value, values, delta, deltaLabel, href, lang, upIsGood = true }: {
  label: string; value: string; values: number[]; delta?: number | null; deltaLabel?: string; href?: string; lang: Lang; upIsGood?: boolean;
}) {
  const max = Math.max(1, ...values);
  const n = values.length;
  const pts = values.map((v, i) => `${n <= 1 ? 50 : ((i / (n - 1)) * 100).toFixed(2)},${(96 - (v / max) * 88).toFixed(2)}`).join(" ");
  const good = delta == null || delta === 0 ? "" : (delta > 0) === upIsGood ? " up" : " down";
  const inner = (
    <>
      <span className="viz-stat-label">{label}</span>
      <strong className="viz-stat-value">{value}</strong>
      {delta != null && <span className={`viz-delta${good}`}><bdi dir="ltr">{delta > 0 ? "▲ +" : delta < 0 ? "▼ " : ""}{delta === 0 ? "=" : `${fmt(delta, lang)}%`}</bdi> <small>{deltaLabel}</small></span>}
      <span className="viz-sparkbox" aria-hidden>
        <svg className="viz-spark" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline points={pts} vectorEffect="non-scaling-stroke" />
        </svg>
        {n > 0 && <span className="viz-spark-dot" style={{ bottom: `${(values[n - 1] / max) * 88 + 4}%` }} />}
      </span>
    </>
  );
  return href ? <a className="viz-stat" href={href}>{inner}</a> : <div className="viz-stat">{inner}</div>;
}

/** Percentage change, or null when there is nothing to compare with. */
export const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
