import { optionLabel } from "@/i18n/dictionaries";
import { siteDict } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { marketData } from "@/admin/market";
import { MarketMap } from "@/admin/MarketMap";
import { requireApp } from "@/lib/auth";

const n0 = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("en"));

function Bars({ rows }: { rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <table className="a-table"><tbody>{rows.map((r) => (
      <tr key={r.label}><td dir="auto">{r.label}</td><td style={{ width: 50 }}><strong>{r.n}</strong></td>
        <td style={{ width: "45%" }}><div className="a-bar" style={{ width: `${Math.round((r.n / max) * 100)}%` }} /></td></tr>))}</tbody></table>
  );
}

/** Market intelligence (strategy §27.2): demand, supply and gaps by area, from our own requests and listings only. */
export default async function MarketPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.market;
  const site = siteDict(lang);
  const days = [30, 90, 180, 365].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 90;
  const d = await marketData(days);
  const name = (a: { nameAr: string; nameEn: string }) => (lang === "ar" ? a.nameAr : a.nameEn);
  const maxWeek = Math.max(1, ...d.weeks.map((w) => w.search + w.listing + w.consulting));
  return (
    <>
      <header className="a-head a-request-head">
        <div><h1>📊 {t.title}</h1><p className="a-muted">{t.intro}</p></div>
        <form className="a-inline" action="/admin/market">
          <select name="days" defaultValue={String(days)} aria-label={t.period}>
            {[30, 90, 180, 365].map((v) => <option key={v} value={v}>{t.periodDays.replace("{n}", String(v))}</option>)}
          </select>
          <button className="a-btn small">{T.money.show}</button>
        </form>
      </header>
      <section className="a-cards">
        <div className="a-card"><strong>{d.totals.openSearch}</strong><span>{t.openSearch}</span></div>
        <div className={`a-card${d.totals.unmet ? " alert" : ""}`}><strong>{d.totals.unmet}</strong><span>{t.unmet}</span></div>
        <div className="a-card"><strong>{d.totals.supply}</strong><span>{t.supply}</span></div>
      </section>
      <section className="a-panel" style={{ marginTop: 20 }}>
        <h2>{t.map}</h2>
        <MarketMap areas={d.stats.map((a) => ({ id: a.id, name: name(a), lat: a.lat, lng: a.lng, boundary: a.boundary, demand: a.demand, supply: a.supply, unmet: a.unmet }))}
          labels={{ demand: t.modeDemand, gap: t.modeGap, unmet: t.modeUnmet }} />
        <p className="a-muted" style={{ marginTop: 8 }}>{t.gapHint}</p>
      </section>
      <section className="a-panel">
        <h2>{t.byArea}</h2>
        <table className="a-table">
          <thead><tr><th>{t.area}</th><th>{t.demand}</th><th>{t.unmetShort}</th><th>{t.supplyShort}</th><th>{t.gap}</th>
            <th>{t.budgetBuy}</th><th>{t.priceSale}</th><th>{t.budgetRent}</th><th>{t.rent}</th></tr></thead>
          <tbody>
            {d.stats.map((a) => (
              <tr key={a.id} className={a.gap > 0 ? "sla-row-amber" : ""}>
                <td data-label={t.area}><strong>{name(a)}</strong></td>
                <td data-label={t.demand}>{a.demand} <span className="a-muted">({a.demandBuy}/{a.demandRent})</span></td>
                <td data-label={t.unmetShort}>{a.unmet}</td>
                <td data-label={t.supplyShort}>{a.supply} <span className="a-muted">({a.supplyBuy}/{a.supplyRent})</span></td>
                <td data-label={t.gap} className={a.gap > 0 ? "a-warn" : ""}>{a.gap > 0 ? `+${a.gap}` : a.gap}</td>
                <td data-label={t.budgetBuy}>{n0(a.medianBudgetBuy)}</td>
                <td data-label={t.priceSale}>{n0(a.medianPriceSale)}</td>
                <td data-label={t.budgetRent}>{n0(a.medianBudgetRent)}</td>
                <td data-label={t.rent}>{n0(a.medianRent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="a-muted">{t.medianNote}</p>
      </section>
      <div className="a-two-lang">
        <section className="a-panel">
          <h2>{t.types}</h2>
          <table className="a-table"><thead><tr><th>{t.type}</th><th>{t.demand}</th><th>{t.supplyShort}</th></tr></thead>
            <tbody>{d.types.map((x) => <tr key={x.type} className={x.demand > x.supply ? "sla-row-amber" : ""}>
              <td>{optionLabel(site, x.type)}</td><td>{x.demand}</td><td>{x.supply}</td></tr>)}</tbody></table>
        </section>
        <section className="a-panel">
          <h2>{t.sources}</h2>
          <table className="a-table"><thead><tr><th>{t.source}</th><th>{t.requests}</th><th>{t.won}</th></tr></thead>
            <tbody>{d.sources.map((s) => <tr key={s.source}><td dir="auto">{s.source}</td><td>{s.n}</td><td>{s.won} ({s.rate}%)</td></tr>)}</tbody></table>
        </section>
        <section className="a-panel"><h2>{t.budgetsBuy}</h2><Bars rows={d.buyBands} /></section>
        <section className="a-panel"><h2>{t.budgetsRent}</h2><Bars rows={d.rentBands} /></section>
      </div>
      <section className="a-panel">
        <h2>{t.trend}</h2>
        <div className="a-trend">
          {d.weeks.map((w, i) => {
            const total = w.search + w.listing + w.consulting;
            return (
              <div key={i} className="a-trend-col" title={`${new Date(w.start).toISOString().slice(5, 10)}: ${total}`}>
                <div className="a-trend-bar" style={{ height: `${(total / maxWeek) * 100}%` }}>
                  <span style={{ flex: w.search }} className="t-s" /><span style={{ flex: w.listing }} className="t-l" /><span style={{ flex: w.consulting }} className="t-c" />
                </div>
                <small>{total}</small>
              </div>
            );
          })}
        </div>
        <p className="a-muted"><span className="a-dot t-s" /> {T.crm.kinds.search} · <span className="a-dot t-l" /> {T.crm.kinds.listing} · <span className="a-dot t-c" /> {T.crm.kinds.consulting}</p>
      </section>
    </>
  );
}
