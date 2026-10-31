import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { dateOnly, money } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { approvals, employees, expenseClaims, invoices, leaves, users } from "@/db/schema";
import { canOpen, requireApp } from "@/lib/auth";

import { approveRefund, rejectRefund } from "../../approval-actions";
import { approveClaim, rejectClaim } from "../../claim-actions";
import { decideLeave } from "../../hr-actions";

/** The approval inbox: refunds (admins), expense claims (managers), leave (HR) — one place for every decision. */
export default async function ApprovalsPage() {
  const user = await requireApp("erp", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.approvals;
  const hr = canOpen(user, "hr");
  const [refunds, claims, leaveRows] = await Promise.all([
    db.select({ a: approvals, inv: invoices.number, who: users.name }).from(approvals).leftJoin(invoices, eq(approvals.invoiceId, invoices.id))
      .innerJoin(users, eq(approvals.requestedBy, users.id)).orderBy(desc(approvals.createdAt)).limit(30),
    db.select({ c: expenseClaims, who: users.name }).from(expenseClaims).innerJoin(users, eq(expenseClaims.userId, users.id))
      .where(eq(expenseClaims.status, "pending")).orderBy(desc(expenseClaims.createdAt)),
    hr ? db.select({ l: leaves, name: employees.name }).from(leaves).innerJoin(employees, eq(leaves.employeeId, employees.id))
      .where(inArray(leaves.status, ["pending"])).orderBy(desc(leaves.createdAt)) : Promise.resolve([]),
  ]);
  const pendingRefunds = refunds.filter((r) => r.a.status === "pending");
  const nothing = !pendingRefunds.length && !claims.length && !leaveRows.length;
  return (
    <>
      <header className="a-head"><h1>{t.title}</h1><p className="a-muted">{t.intro}</p></header>
      {nothing && <section className="a-panel"><p className="a-ok">✓ {t.none}</p></section>}
      <section className="a-panel">
        <h2>↩ {t.refunds}</h2>
        {refunds.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <ul className="a-list">
            {refunds.map(({ a, inv, who }) => (
              <li key={a.id}>
                <div className="a-panel-head">
                  <span><Link href={`/admin/invoices/${a.invoiceId}`} dir="ltr">{inv}</Link> · <strong>{money(a.amount, lang)}</strong> · <span dir="auto">{a.reason}</span></span>
                  <span className={`a-status ${a.status === "approved" ? "s-won" : a.status === "rejected" ? "s-closed" : "s-viewing"}`}>{t.statuses[a.status]}</span>
                </div>
                <span className="a-muted">{t.requestedBy}: {who} · {dateOnly(a.createdAt, lang)} · {T.money.methods[a.method]}{a.decisionNote ? ` · ${a.decisionNote}` : ""}</span>
                {a.status === "pending" && (user.role === "admin" && a.requestedBy !== user.id ? (
                  <form action={approveRefund} className="a-inline">
                    <input type="hidden" name="id" value={a.id} />
                    <input name="note" placeholder={t.note} aria-label={t.note} dir="auto" />
                    <button className="a-btn small primary">{t.approve}</button>
                    <button className="a-btn small danger" formAction={rejectRefund}>{t.reject}</button>
                  </form>
                ) : <span className="a-muted">{t.refundOnlyAdmin}</span>)}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="a-panel">
        <div className="a-panel-head"><h2>🧾 {t.claims}</h2><Link href="/admin/claims?tab=approve">{T.claims.toApprove} →</Link></div>
        {claims.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <ul className="a-list">
            {claims.map(({ c, who }) => (
              <li key={c.id}>
                <span><strong>{who}</strong> · {money(c.amount, lang)} · <span dir="auto">{c.description}</span>
                  {c.receiptUrl && <> · <a href={c.receiptUrl} target="_blank" rel="noreferrer">🧾</a></>}</span>
                {c.userId !== user.id && (
                  <form action={approveClaim} className="a-inline">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="note" placeholder={t.note} aria-label={t.note} dir="auto" />
                    <button className="a-btn small primary">{t.approve}</button>
                    <button className="a-btn small danger" formAction={rejectClaim}>{t.reject}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {hr && (
        <section className="a-panel">
          <h2>🌴 {t.leave}</h2>
          {leaveRows.length === 0 ? <p className="a-muted">{t.none}</p> : (
            <ul className="a-list">
              {leaveRows.map(({ l, name }) => (
                <li key={l.id}>
                  <span><strong>{name}</strong> · {T.hr.leaveTypes[l.type]} · {dateOnly(l.fromDate, lang)} → {dateOnly(l.toDate, lang)} ({l.days} {T.hr.days})</span>
                  <div className="a-actions">
                    <form action={decideLeave}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value="approved" />
                      <button className="a-btn small primary">{t.approve}</button></form>
                    <form action={decideLeave}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value="rejected" />
                      <button className="a-btn small danger">{t.reject}</button></form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
