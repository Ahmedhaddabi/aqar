import { and, asc, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import Link from "next/link";

import { ColumnChart } from "@/admin/charts";
import { dateOnly, money } from "@/admin/format";
import { expiringSoon, omanToday } from "@/admin/hr";
import { adminDict, adminLang } from "@/admin/i18n";
import { financeSummary, monthlyMoney } from "@/admin/money";
import { db } from "@/db";
import { approvals, contacts, expenseClaims, invoices, onlinePayments, payments, recurringExpenses, serviceJobs } from "@/db/schema";
import { OPEN_JOB, slaOf } from "@/lib/jobs";
import { requireApp } from "@/lib/auth";

/** ERP home: this month's money, what customers owe, team items waiting, and anything about to expire. */
export default async function ErpPage() {
  const user = await requireApp("erp", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.erp;
  const today = omanToday();
  const paidSum = sql<number>`coalesce((select sum(${payments.amount}) from ${payments} where ${payments.invoiceId} = ${invoices.id}), 0)::float`;
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
  const [month, openJobs, claims, online, unpaid, expiring, byMonth] = await Promise.all([
    financeSummary(`${today.slice(0, 7)}-01`, today),
    db.select().from(serviceJobs).where(inArray(serviceJobs.status, [...OPEN_JOB])),
    n(db.select({ n: count() }).from(expenseClaims).where(inArray(expenseClaims.status, ["pending", "approved"]))),
    n(db.select({ n: count() }).from(onlinePayments).where(and(eq(onlinePayments.status, "paid"),
      gte(onlinePayments.paidAt, new Date(Date.now() - 7 * 86_400_000))))),
    db.select({ inv: invoices, customer: contacts.name, paid: paidSum }).from(invoices).innerJoin(contacts, eq(invoices.contactId, contacts.id))
      .where(and(eq(invoices.kind, "invoice"), inArray(invoices.status, ["sent", "partly_paid"]))).orderBy(asc(invoices.dueDate)).limit(8),
    expiringSoon(30),
    monthlyMoney(today.slice(0, 7), 6),
  ]);
  const C = T.charts;
  const names = C.months.split("|");
  const lateJobs = openJobs.filter((j) => slaOf(j) === "red").length;
  const weekAhead = new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10);
  const [recurringDue, refundsWaiting] = await Promise.all([
    n(db.select({ n: count() }).from(recurringExpenses).where(and(eq(recurringExpenses.active, true), lte(recurringExpenses.nextDue, weekAhead)))),
    n(db.select({ n: count() }).from(approvals).where(eq(approvals.status, "pending")))]);
  const cards: [string, string | number, string, string?][] = [
    [t.incomeMonth, money(month.income, lang), "/admin/finance"],
    [t.owed, money(month.receivable, lang), "/admin/invoices?tab=unpaid", month.receivable > 0 ? "alert" : undefined],
    [t.spentMonth, money(month.spent, lang), "/admin/expenses"],
    [t.onlineToday, online, "/admin/invoices"],
    [T.jobs.title, openJobs.length, "/admin/jobs"],
    [`${T.jobs.title}: ${T.jobs.sla.red}`, lateJobs, "/admin/jobs", lateJobs ? "danger" : undefined],
    [T.claims.toApprove, claims + refundsWaiting, "/admin/approvals", claims + refundsWaiting ? "alert" : undefined],
    [T.recurring.due, recurringDue, "/admin/recurring", recurringDue ? "alert" : undefined],
  ];
  return (
    <>
      <section className="a-band">
        <div className="a-band-grid" />
        <div className="a-bandrow">
          <div><span className="a-chip"><i />{T.nav.erp}</span><h1>{t.title}</h1><p>{t.intro}</p></div>
          <div className="a-inline">
            <Link className="a-btn primary" href="/admin/invoices/new?kind=invoice">+ {T.money.newInvoice}</Link>
            <Link className="a-btn" href="/admin/invoices/new?kind=quote">+ {T.money.newQuote}</Link>
            <Link className="a-btn" href="/admin/expenses">+ {T.money.addExpense}</Link>
          </div>
        </div>
        <div className="a-cards">
          {cards.map(([label, value, href, tone]) => (
            <Link key={label} href={href} className={`a-card${tone ? ` ${tone}` : ""}`}><strong>{value}</strong><span>{label}</span></Link>
          ))}
        </div>
      </section>
      <section className="a-panel" style={{ marginTop: 20 }}>
        <h2><Link href="/admin/finance">{C.moneySix}</Link></h2>
        <ColumnChart lang={lang} unit={lang === "ar" ? "ر.ع" : "OMR"} tableLabel={C.table} height={160}
          series={[{ name: C.income, slot: 1 }, { name: C.spent, slot: 2 }]}
          groups={byMonth.map((r) => ({ label: names[Number(r.month.slice(5)) - 1], long: `${names[Number(r.month.slice(5)) - 1]} ${r.month.slice(0, 4)}`,
            values: [Math.round(r.income), Math.round(r.spent)] }))}
          extra={{ name: C.profit, values: byMonth.map((r) => Math.round(r.income - r.spent)) }} />
      </section>
      <div className="a-two" style={{ marginTop: 20 }}>
        <section className="a-panel">
          <h2>{t.unpaid}</h2>
          {unpaid.length === 0 ? <p className="a-muted">{t.none}</p> : (
            <ul className="a-list">
              {unpaid.map(({ inv, customer, paid }) => {
                const late = !!inv.dueDate && inv.dueDate < today;
                return (
                  <li key={inv.id} className={late ? "late" : ""}>
                    <Link href={`/admin/invoices/${inv.id}`}><strong dir="ltr">{inv.number}</strong> · {customer}</Link>
                    <span className="a-muted">{money(inv.total - paid, lang)}{inv.dueDate ? ` · ${dateOnly(inv.dueDate, lang)}` : ""}{late ? ` · ${t.overdue}` : ""}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="a-panel a-expiring">
          <h2>⚠ {T.today.expiring}</h2>
          {expiring.length === 0 ? <p className="a-muted">{t.none}</p> : (
            <ul className="a-list">
              {expiring.map((x) => (
                <li key={x.key} className={x.days < 0 ? "late" : ""}>
                  <Link href={x.href}><strong>{x.title}</strong>{x.doc ? ` · ${T.hr.docNames[x.doc]}` : ""}</Link>
                  <span className="a-muted">{dateOnly(x.date, lang)} · {x.days < 0 ? T.hr.expired : `${x.days} ${T.hr.days}`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
