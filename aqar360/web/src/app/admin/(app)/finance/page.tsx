import { ColumnChart } from "@/admin/charts";
import { money } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { arAging, financeSummary, monthlyMoney } from "@/admin/money";
import { requireApp } from "@/lib/auth";

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requireApp("erp", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).money;
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  const q = await searchParams;
  const from = isDate(q.from) ? q.from! : `${today.slice(0, 7)}-01`;
  const to = isDate(q.to) ? q.to! : today;
  const [s, aging, byMonth] = await Promise.all([financeSummary(from, to), arAging(today), monthlyMoney(to.slice(0, 7), 12)]);
  const C = adminDict(lang).charts;
  const names = C.months.split("|");
  const R = adminDict(lang).receipts;
  const cards: [string, number, string?][] = [[t.income, s.income], [t.spent, s.spent], [t.profit, s.profit, s.profit < 0 ? "danger" : undefined],
    [t.receivable, s.receivable, s.receivable > 0 ? "alert" : undefined], [t.mediaHeld, s.media], [t.pettyCash, s.petty],
    ...(s.vat > 0 ? [[t.vatCollected, s.vat] as [string, number]] : [])];
  return (
    <>
      <header className="a-head"><h1>{t.finance}</h1><p className="a-muted">{t.financeIntro}</p></header>
      <form className="a-inline a-toolbar" action="/admin/finance">
        <label className="a-inline">{t.from_} <input type="date" name="from" defaultValue={from} /></label>
        <label className="a-inline">{t.to} <input type="date" name="to" defaultValue={to} /></label>
        <button className="a-btn">{t.show}</button>
        <a className="a-btn small" href={`/admin/finance?from=${today.slice(0, 4)}-01-01&to=${today}`}>{t.year}</a>
      </form>
      <section className="a-cards">
        {cards.map(([label, value, tone]) => <div key={label} className={`a-card${tone ? ` ${tone}` : ""}`}><strong>{money(value, lang)}</strong><span>{label}</span></div>)}
      </section>
      <section className="a-panel" style={{ marginTop: 20 }}>
        <h2>{C.moneyByMonth}</h2>
        <p className="a-muted">{C.moneyByMonthHelp}</p>
        <ColumnChart lang={lang} unit={lang === "ar" ? "ر.ع" : "OMR"} tableLabel={C.table}
          series={[{ name: C.income, slot: 1 }, { name: C.spent, slot: 2 }]}
          groups={byMonth.map((r) => ({ label: names[Number(r.month.slice(5)) - 1].slice(0, lang === "ar" ? 10 : 3), long: `${names[Number(r.month.slice(5)) - 1]} ${r.month.slice(0, 4)}`,
            values: [Math.round(r.income), Math.round(r.spent)] }))}
          extra={{ name: C.profit, values: byMonth.map((r) => Math.round(r.income - r.spent)) }} />
      </section>
      <section className="a-panel">
        <h2>{R.aging}</h2>
        <div className="a-cards">
          {(["current", "d30", "d60", "d90", "d90p"] as const).map((k) => (
            <a key={k} href="/admin/invoices?tab=unpaid" className={`a-card${k === "d90p" && aging[k] > 0 ? " danger" : k !== "current" && aging[k] > 0 ? " alert" : ""}`}>
              <strong>{money(aging[k], lang)}</strong><span>{R[k]}</span></a>
          ))}
        </div>
      </section>
      <section className="a-panel">
        <h2>{t.byCategory}</h2>
        {Object.keys(s.byCategory).length === 0 ? <p className="a-muted">{t.none}</p> : (
          <table className="a-table"><tbody>
            {Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]).map(([c, v]) => (
              <tr key={c}><td>{t.categories[c] ?? c}</td><td>{money(v, lang)}</td>
                <td style={{ width: "40%" }}><div className="a-bar" style={{ width: `${Math.round((v / (s.spent || 1)) * 100)}%` }} /></td></tr>
            ))}
          </tbody></table>
        )}
      </section>
      <section className="a-panel">
        <h2>{adminDict(lang).reports.downloads}</h2>
        <div className="a-inline">
          {(["invoices", "payments", "expenses"] as const).map((k) => <a key={k} className="a-btn small" href={`/admin/export/${k}`} download>⬇ {adminDict(lang).reports.exports[k]}</a>)}
        </div>
      </section>
    </>
  );
}
