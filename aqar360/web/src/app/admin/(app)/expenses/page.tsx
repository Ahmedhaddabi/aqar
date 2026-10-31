import { dateOnly, money } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { listExpenses } from "@/admin/money";
import { ReceiptInput } from "@/admin/money-ui";
import { EXPENSE_CATEGORIES } from "@/db/schema";
import { requireApp } from "@/lib/auth";

import { addExpense, deleteExpense } from "../../money-actions";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireApp("erp", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).money;
  const nowOman = new Date(Date.now() + 4 * 3_600_000).toISOString();
  const raw = (await searchParams).month;
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : nowOman.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const rows = await listExpenses(`${month}-01`, `${month}-${String(last).padStart(2, "0")}`);
  const total = rows.reduce((a, e) => a + e.amount, 0);
  return (
    <>
      <header className="a-head"><h1>{t.expenses}</h1><p className="a-muted">{t.expensesIntro}</p></header>
      <section className="a-panel">
        <h2>{t.addExpense}</h2>
        <form action={addExpense} className="a-form a-grid">
          <label className="a-field"><span>{t.date}</span><input type="date" name="spentOn" defaultValue={nowOman.slice(0, 10)} required /></label>
          <label className="a-field"><span>{t.category}</span>
            <select name="category">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t.categories[c]}</option>)}</select></label>
          <label className="a-field"><span>{t.amount}</span><input type="number" name="amount" min={0.001} step="0.001" required /></label>
          <label className="a-field"><span>{t.paidFrom}</span>
            <select name="paidFrom">{Object.entries(t.paidFromValues).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
          <label className="a-field"><span>{t.vendor}</span><input name="vendor" dir="auto" /></label>
          <label className="a-field"><span>{t.description}</span><input name="description" dir="auto" /></label>
          <ReceiptInput t={t} />
          <div><button className="a-btn primary">+ {t.addExpense}</button></div>
        </form>
      </section>
      <section className="a-panel">
        <div className="a-panel-head">
          <form className="a-inline" action="/admin/expenses"><input type="month" name="month" defaultValue={month} /><button className="a-btn small">{t.show}</button></form>
          <p>{t.total}: <strong>{money(total, lang)}</strong></p>
        </div>
        {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <table className="a-table">
            <thead><tr><th>{t.date}</th><th>{t.category}</th><th>{t.description}</th><th>{t.amount}</th><th>{t.paidFrom}</th><th /></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td data-label={t.date}>{dateOnly(e.spentOn, lang)}</td>
                  <td data-label={t.category}>{t.categories[e.category]}</td>
                  <td data-label={t.description}>{[e.vendor, e.description].filter(Boolean).join(" · ")}
                    {e.receiptUrl && <> · <a href={e.receiptUrl} target="_blank" rel="noreferrer">🧾</a></>}</td>
                  <td data-label={t.amount}>{money(e.amount, lang)}</td>
                  <td data-label={t.paidFrom}>{t.paidFromValues[e.paidFrom]}</td>
                  <td>{user.role === "admin" && <form action={deleteExpense}><input type="hidden" name="id" value={e.id} /><button className="a-btn small danger">×</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
