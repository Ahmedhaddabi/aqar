import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import Link from "next/link";

import { BarList, LineChart } from "@/admin/charts";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { areas, OPEN_STATUSES, requests, users } from "@/db/schema";
import { requireApp } from "@/lib/auth";

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

const Bars = ({ rows, labels, lang, ordered }: { rows: { key: string; n: number }[]; labels?: Record<string, string>; lang: "ar" | "en"; ordered?: boolean }) => (
  <BarList lang={lang} ordered={ordered} rows={rows.map((r) => ({ label: labels?.[r.key] ?? r.key, value: r.n }))} />
);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.reports;
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  const q = await searchParams;
  const from = isDate(q.from) ? q.from! : `${today.slice(0, 7)}-01`;
  const to = isDate(q.to) ? q.to! : today;
  // Period in Oman time: [from 00:00, to + 1 day 00:00).
  const start = new Date(`${from}T00:00:00+04:00`);
  const end = new Date(Date.parse(`${to}T00:00:00+04:00`) + 86_400_000);
  const inPeriod = and(gte(requests.createdAt, start), lt(requests.createdAt, end));
  const hours = sql<number>`avg(extract(epoch from (${requests.firstResponseAt} - ${requests.createdAt})) / 3600)::float`;

  const [[totals], byKind, bySource, byStatus, byAgent, topAreas] = await Promise.all([
    db.select({ n: count(), won: sql<number>`count(*) filter (where ${requests.status} = 'won')::int`,
      closed: sql<number>`count(*) filter (where ${requests.status} = 'closed')::int`, hours }).from(requests).where(inPeriod),
    db.select({ key: requests.kind, n: count() }).from(requests).where(inPeriod).groupBy(requests.kind).orderBy(desc(count())),
    db.select({ key: sql<string>`coalesce(nullif(${requests.attribution}->>'utm_source', ''), ${requests.sourceChannel}, 'direct')`, n: count() })
      .from(requests).where(inPeriod).groupBy(sql`1`).orderBy(desc(count())).limit(10),
    db.select({ key: requests.status, n: count() }).from(requests).where(inArray(requests.status, [...OPEN_STATUSES])).groupBy(requests.status),
    db.select({ name: users.name, n: count(), won: sql<number>`count(*) filter (where ${requests.status} = 'won')::int`, hours })
      .from(requests).innerJoin(users, eq(requests.assignedTo, users.id)).where(inPeriod).groupBy(users.name).orderBy(desc(count())),
    db.select({ key: sql<string>`${areas.nameAr}`, en: areas.nameEn, n: count() }).from(requests)
      .innerJoin(areas, sql`${areas.id} = any(${requests.areaIds})`).where(inPeriod).groupBy(areas.id).orderBy(desc(count())).limit(8),
  ]);
  // New requests over time: per day for up to about two months, per week beyond.
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const weekly = days > 62;
  const bucket = weekly ? sql<string>`to_char(date_trunc('week', ${requests.createdAt} at time zone 'Asia/Muscat'), 'YYYY-MM-DD')`
    : sql<string>`to_char(${requests.createdAt} at time zone 'Asia/Muscat', 'YYYY-MM-DD')`;
  const perBucket = await db.select({ key: bucket, n: count() }).from(requests).where(inPeriod).groupBy(sql`1`);
  const C = T.charts;
  const names = C.months.split("|");
  const series: { label: string; long: string; value: number }[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d = new Date(d.getTime() + 86_400_000)) {
    const key = d.toISOString().slice(0, 10);
    if (weekly && d.getUTCDay() !== 1 && key !== from) continue;
    const monday = weekly ? new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10) : key;
    const label = `${Number(monday.slice(8))} ${names[Number(monday.slice(5, 7)) - 1].slice(0, lang === "ar" ? 10 : 3)}`;
    series.push({ label, long: weekly ? `${C.weekOf} ${label}` : label, value: perBucket.find((b) => b.key === monday)?.n ?? 0 });
  }
  const h = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} ${t.hours}`);
  const cards: [string, string | number][] = [[t.newRequests, totals.n], [t.won, totals.won], [t.closed, totals.closed], [t.firstReply, h(totals.hours)]];
  const statusOrder = OPEN_STATUSES as readonly string[];
  return (
    <>
      <header className="a-head"><h1>{t.title}</h1><p className="a-muted">{t.intro}</p>
        <p><Link className="a-btn small" href="/admin/reports/weekly">📨 {adminDict(lang).weekly.link}</Link></p></header>
      <form className="a-inline a-toolbar" action="/admin/reports">
        <label className="a-inline">{T.money.from_} <input type="date" name="from" defaultValue={from} /></label>
        <label className="a-inline">{T.money.to} <input type="date" name="to" defaultValue={to} /></label>
        <button className="a-btn">{T.money.show}</button>
      </form>
      <section className="a-cards">
        {cards.map(([label, value]) => <div key={label} className="a-card"><strong>{value}</strong><span>{label}</span></div>)}
      </section>
      <section className="a-panel" style={{ marginTop: 20 }}>
        <h2>{C.requestsOverTime} <span className="a-muted">· {weekly ? C.perWeek : C.perDay}</span></h2>
        {totals.n ? <LineChart lang={lang} name={C.requests} tableLabel={C.table} points={series} /> : <p className="a-muted">{t.none}</p>}
      </section>
      <div className="a-two-lang">
        <section className="a-panel"><h2>{C.pipeline}</h2>
          {byStatus.length ? <Bars lang={lang} ordered rows={[...byStatus].sort((a, b) => statusOrder.indexOf(a.key) - statusOrder.indexOf(b.key))} labels={T.crm.statuses} />
            : <p className="a-muted">{t.none}</p>}</section>
        <section className="a-panel"><h2>{t.byKind}</h2>
          {byKind.length ? <Bars lang={lang} rows={byKind} labels={T.crm.kinds} /> : <p className="a-muted">{t.none}</p>}</section>
        <section className="a-panel"><h2>{t.bySource}</h2>
          {bySource.length ? <Bars lang={lang} rows={bySource} labels={{ direct: t.direct }} /> : <p className="a-muted">{t.none}</p>}</section>
        <section className="a-panel"><h2>{t.topAreas}</h2>
          {topAreas.length ? <Bars lang={lang} rows={topAreas.map((a) => ({ key: lang === "ar" ? a.key : a.en, n: a.n }))} /> : <p className="a-muted">{t.none}</p>}</section>
      </div>
      <section className="a-panel">
        <h2>{t.byAgent}</h2>
        {byAgent.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <table className="a-table">
            <thead><tr><th>{t.agent}</th><th>{t.assigned}</th><th>{t.won}</th><th>{t.firstReply}</th></tr></thead>
            <tbody>{byAgent.map((a) => <tr key={a.name}><td>{a.name}</td><td>{a.n}</td><td>{a.won}</td><td>{h(a.hours)}</td></tr>)}</tbody>
          </table>
        )}
      </section>
      <section className="a-panel">
        <h2>{t.downloads}</h2>
        <div className="a-inline">
          {Object.entries(t.exports).map(([k, label]) => <a key={k} className="a-btn small" href={`/admin/export/${k}`} download>⬇ {label}</a>)}
        </div>
      </section>
    </>
  );
}
