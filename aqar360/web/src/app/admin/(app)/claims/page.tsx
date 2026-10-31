import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { dateOnly, money } from "@/admin/format";
import { omanToday } from "@/admin/hr";
import { adminDict, adminLang } from "@/admin/i18n";
import { ReceiptInput } from "@/admin/money-ui";
import { db } from "@/db";
import { EXPENSE_CATEGORIES, expenseClaims, users } from "@/db/schema";
import { canOpen, requireUser } from "@/lib/auth";

import { addClaim, approveClaim, rejectClaim, reimburseClaim, uploadClaimReceipt } from "../../claim-actions";

const TONE: Record<string, string> = { pending: "s-viewing", approved: "s-working", rejected: "s-closed", reimbursed: "s-won" };

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireUser();
  const lang = await adminLang(me.language);
  const T = adminDict(lang);
  const t = T.claims;
  const approver = me.role !== "agent" && canOpen(me, "erp");
  const tab = approver && (await searchParams).tab === "approve" ? "approve" : "mine";
  const rows = tab === "mine"
    ? await db.select({ c: expenseClaims, name: users.name }).from(expenseClaims).innerJoin(users, eq(expenseClaims.userId, users.id))
      .where(eq(expenseClaims.userId, me.id)).orderBy(desc(expenseClaims.createdAt)).limit(100)
    : await db.select({ c: expenseClaims, name: users.name }).from(expenseClaims).innerJoin(users, eq(expenseClaims.userId, users.id))
      .where(inArray(expenseClaims.status, ["pending", "approved"])).orderBy(desc(expenseClaims.createdAt)).limit(200);
  const today = omanToday();
  return (
    <>
      <header className="a-head"><h1>{t.title}</h1><p className="a-muted">{t.intro}</p></header>
      {approver && (
        <nav className="a-tabs a-toolbar">
          <Link href="/admin/claims" aria-current={tab === "mine" ? "page" : undefined}>{t.mine}</Link>
          <Link href="/admin/claims?tab=approve" aria-current={tab === "approve" ? "page" : undefined}>{t.toApprove}</Link>
        </nav>
      )}
      {tab === "mine" && (
        <section className="a-panel">
          <h2>{t.add}</h2>
          <form action={addClaim} className="a-form a-grid">
            <label className="a-field"><span>{T.money.date}</span><input type="date" name="spentOn" defaultValue={today} max={today} required /></label>
            <label className="a-field"><span>{T.money.category}</span>
              <select name="category">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{T.money.categories[c]}</option>)}</select></label>
            <label className="a-field"><span>{T.money.amount}</span><input type="number" name="amount" min={0.001} step="0.001" required /></label>
            <label className="a-field"><span>{T.money.description}</span><input name="description" required minLength={2} dir="auto" /></label>
            <ReceiptInput t={T.money} upload={uploadClaimReceipt} />
            <div><button className="a-btn primary">+ {t.add}</button></div>
          </form>
        </section>
      )}
      <section className="a-panel">
        {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <table className="a-table">
            <thead><tr><th>{T.money.date}</th>{tab === "approve" && <th>{t.staff}</th>}<th>{T.money.description}</th><th>{T.money.amount}</th><th>{T.money.status}</th><th /></tr></thead>
            <tbody>
              {rows.map(({ c, name }) => (
                <tr key={c.id}>
                  <td data-label={T.money.date}>{dateOnly(c.spentOn, lang)}</td>
                  {tab === "approve" && <td data-label={t.staff}>{name}</td>}
                  <td data-label={T.money.description}><span dir="auto">{c.description}</span> <span className="a-muted">· {T.money.categories[c.category]}</span>
                    {c.receiptUrl && <> · <a href={c.receiptUrl} target="_blank" rel="noreferrer">🧾</a></>}
                    {c.decisionNote && <div className="a-muted">{c.decisionNote}</div>}</td>
                  <td data-label={T.money.amount}>{money(c.amount, lang)}</td>
                  <td data-label={T.money.status}><span className={`a-status ${TONE[c.status]}`}>{t.statuses[c.status]}</span></td>
                  <td>
                    {tab === "approve" && c.status === "pending" && c.userId !== me.id && (
                      <form action={approveClaim} className="a-inline">
                        <input type="hidden" name="id" value={c.id} />
                        <input name="note" placeholder={t.note} aria-label={t.note} dir="auto" />
                        <button className="a-btn small primary">{t.approve}</button>
                        <button className="a-btn small danger" formAction={rejectClaim}>{t.reject}</button>
                      </form>
                    )}
                    {tab === "approve" && c.status === "approved" && (
                      <form action={reimburseClaim} className="a-inline">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="date" name="reimbursedOn" defaultValue={today} required aria-label={t.reimburse} />
                        <input name="reference" placeholder={t.reference} aria-label={t.reference} />
                        <button className="a-btn small primary">{t.reimburse}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
