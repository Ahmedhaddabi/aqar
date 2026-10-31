import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dateOnly, money } from "@/admin/format";
import { omanToday } from "@/admin/hr";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { EXPENSE_CATEGORIES, expenses, recurringExpenses } from "@/db/schema";
import { audit, requireApp } from "@/lib/auth";

const addMonths = (day: string, months: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last)); // 31 Jan + 1 month = 28/29 Feb
  return target.toISOString().slice(0, 10);
};

async function addRecurring(form: FormData) {
  "use server";
  const user = await requireApp("erp", ["admin", "manager"]);
  const parsed = z.object({ title: z.string().trim().min(2).max(120), category: z.enum(EXPENSE_CATEGORIES), amount: z.coerce.number().positive(),
    paidFrom: z.enum(["bank", "petty_cash", "card"]), everyMonths: z.coerce.number().int().refine((v) => [1, 3, 6, 12].includes(v)),
    nextDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const [row] = await db.insert(recurringExpenses).values(parsed.data).returning({ id: recurringExpenses.id });
  await audit("recurring_added", "recurring_expense", row.id, {}, user.id);
  revalidatePath("/admin/recurring");
}

/** One click: the expense is recorded on its due date and the next due date moves forward. */
async function recordRecurring(form: FormData) {
  "use server";
  const user = await requireApp("erp", ["admin", "manager"]);
  const id = Number(form.get("id"));
  const [r] = Number.isInteger(id) ? await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, id)) : [];
  if (!r?.active) return;
  await db.insert(expenses).values({ spentOn: r.nextDue, category: r.category, description: r.title, amount: r.amount, paidFrom: r.paidFrom,
    vendor: "", createdBy: user.id });
  await db.update(recurringExpenses).set({ nextDue: addMonths(r.nextDue, r.everyMonths) }).where(eq(recurringExpenses.id, r.id));
  await audit("recurring_recorded", "recurring_expense", r.id, { amount: r.amount, due: r.nextDue }, user.id);
  revalidatePath("/admin/recurring");
}

async function stopRecurring(form: FormData) {
  "use server";
  const user = await requireApp("erp", ["admin", "manager"]);
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  await db.update(recurringExpenses).set({ active: false }).where(eq(recurringExpenses.id, id));
  await audit("recurring_stopped", "recurring_expense", id, {}, user.id);
  revalidatePath("/admin/recurring");
}

export default async function RecurringPage() {
  const user = await requireApp("erp", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.recurring;
  const today = omanToday();
  const rows = await db.select().from(recurringExpenses).where(eq(recurringExpenses.active, true)).orderBy(asc(recurringExpenses.nextDue));
  const soon = (d: string) => (Date.parse(d) - Date.parse(today)) / 86_400_000 <= 7;
  return (
    <>
      <header className="a-head"><h1>{t.title}</h1><p className="a-muted">{t.intro}</p></header>
      <section className="a-panel">
        <h2>{t.add}</h2>
        <form action={addRecurring} className="a-form a-grid">
          <label className="a-field"><span>{t.name}</span><input name="title" required minLength={2} dir="auto" /></label>
          <label className="a-field"><span>{T.money.category}</span>
            <select name="category">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{T.money.categories[c]}</option>)}</select></label>
          <label className="a-field"><span>{T.money.amount}</span><input type="number" name="amount" min={0.001} step="0.001" required /></label>
          <label className="a-field"><span>{T.money.paidFrom}</span>
            <select name="paidFrom">{Object.entries(T.money.paidFromValues).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="a-field"><span>{t.every}</span>
            <select name="everyMonths" defaultValue="1">{Object.entries(t.everyValues).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="a-field"><span>{t.nextDue}</span><input type="date" name="nextDue" defaultValue={today} required /></label>
          <div><button className="a-btn primary">+ {t.add}</button></div>
        </form>
      </section>
      <section className="a-panel">
        {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <table className="a-table">
            <thead><tr><th>{t.name}</th><th>{T.money.amount}</th><th>{t.every}</th><th>{t.nextDue}</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={soon(r.nextDue) ? "sla-row-amber" : ""}>
                  <td data-label={t.name}><strong dir="auto">{r.title}</strong><div className="a-muted">{T.money.categories[r.category]} · {T.money.paidFromValues[r.paidFrom]}</div></td>
                  <td data-label={T.money.amount}>{money(r.amount, lang)}</td>
                  <td data-label={t.every}>{t.everyValues[String(r.everyMonths)]}</td>
                  <td data-label={t.nextDue}>{dateOnly(r.nextDue, lang)}{soon(r.nextDue) && <span className="a-warn"> · {t.due}</span>}</td>
                  <td><div className="a-actions">
                    <form action={recordRecurring}><input type="hidden" name="id" value={r.id} /><button className="a-btn small primary">✓ {t.record}</button></form>
                    <form action={stopRecurring}><input type="hidden" name="id" value={r.id} /><button className="a-btn small danger">{t.stop}</button></form>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
