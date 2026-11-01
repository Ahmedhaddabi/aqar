import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { z } from "zod";

import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { targets, users } from "@/db/schema";
import { audit, requireApp } from "@/lib/auth";
import { currentMonth, performance } from "@/lib/performance";

const optNum = z.union([z.literal("").transform(() => null), z.coerce.number().min(0).max(1e9)]);

async function saveGoals(form: FormData) {
  "use server";
  const admin = await requireApp("crm", ["admin", "manager"]);
  const parsed = z.object({ userId: z.coerce.number().int().positive(), month: z.string().regex(/^\d{4}-\d{2}$/), won: optNum, viewings: optNum, income: optNum,
    pct: z.coerce.number().min(0).max(100) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { userId, month, won, viewings, income, pct } = parsed.data;
  const value = { won: won === null ? null : Math.round(won), viewings: viewings === null ? null : Math.round(viewings), income };
  await db.insert(targets).values({ userId, month, ...value }).onConflictDoUpdate({ target: [targets.userId, targets.month], set: value });
  await db.update(users).set({ commissionPct: pct }).where(eq(users.id, userId));
  await audit("targets_saved", "user", userId, { month, ...value, commissionPct: pct }, admin.id);
  revalidatePath("/admin/performance");
}

function Bar({ value, goal, unit = "" }: { value: number; goal: number | null; unit?: string }) {
  const fmt = (v: number) => new Intl.NumberFormat("en", { maximumFractionDigits: unit ? 0 : 1 }).format(v);
  const pct = goal ? Math.min(100, Math.round((value / goal) * 100)) : null;
  return (
    <div className="a-goal">
      <strong dir="ltr">{fmt(value)}{unit}</strong>
      {goal ? <><span className="a-goal-bar"><span style={{ width: `${pct}%` }} className={pct! >= 100 ? "done" : ""} /></span>
        <small className="a-muted" dir="ltr">/ {fmt(goal)}{unit} · {pct}%</small></> : null}
    </div>
  );
}

/** Deals, viewings, income and commission per person this month, against targets. Agents see only themselves. */
export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const t = adminDict(lang).perf;
  const q = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(q.month ?? "") ? q.month! : currentMonth();
  const manager = user.role !== "agent";
  const rows = await performance(month, manager ? undefined : user.id);
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.toISOString().slice(0, 7);
  };
  const label = new Intl.DateTimeFormat(lang === "ar" ? "ar-OM" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const omr = " OMR";
  return (
    <>
      <header className="a-head"><h1>🏆 {t.title}</h1><p className="a-muted">{t.intro}</p></header>
      <div className="a-toolbar">
        <div className="a-inline">
          <Link className="a-btn small" href={`/admin/performance?month=${shift(-1)}`}>{lang === "ar" ? "→" : "←"}</Link>
          <strong>{label}</strong>
          <Link className="a-btn small" href={`/admin/performance?month=${shift(1)}`}>{lang === "ar" ? "←" : "→"}</Link>
        </div>
      </div>
      <section className="a-panel">
        {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <table className="a-table">
            <thead><tr><th>#</th><th>{t.person}</th><th>{t.won}</th><th>{t.viewings}</th><th>{t.income}</th><th>{t.commission}</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td data-label="#">{manager ? (i === 0 && r.income > 0 ? "🥇" : i === 1 && r.income > 0 ? "🥈" : i === 2 && r.income > 0 ? "🥉" : i + 1) : ""}</td>
                  <td data-label={t.person}><strong>{r.name}</strong></td>
                  <td data-label={t.won}><Bar value={r.won} goal={r.target.won} /></td>
                  <td data-label={t.viewings}><Bar value={r.viewings} goal={r.target.viewings} /></td>
                  <td data-label={t.income}><Bar value={r.income} goal={r.target.income} unit={omr} /></td>
                  <td data-label={t.commission}><strong dir="ltr">{r.commission.toFixed(3)}{omr}</strong><div className="a-muted">{r.pct}%</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="a-muted">{t.how}</p>
      </section>
      {manager && rows.length > 0 && (
        <section className="a-panel">
          <h2>{t.setTitle}</h2>
          <p className="a-muted">{t.setIntro}</p>
          {rows.map((r) => (
            <form key={r.id} action={saveGoals} className="a-inline a-goal-form">
              <input type="hidden" name="userId" value={r.id} /><input type="hidden" name="month" value={month} />
              <strong>{r.name}</strong>
              <label>{t.won} <input name="won" type="number" min={0} defaultValue={r.target.won ?? ""} /></label>
              <label>{t.viewings} <input name="viewings" type="number" min={0} defaultValue={r.target.viewings ?? ""} /></label>
              <label>{t.income} <input name="income" type="number" min={0} step="any" defaultValue={r.target.income ?? ""} /></label>
              <label>{t.pct} <input name="pct" type="number" min={0} max={100} step="any" defaultValue={r.pct} /></label>
              <button className="a-btn small">{t.save}</button>
            </form>
          ))}
        </section>
      )}
    </>
  );
}
