import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { dateOnly, money, whatsappLink } from "@/admin/format";
import { adminDict, adminLang, fill } from "@/admin/i18n";
import { InvoiceDocument } from "@/admin/InvoiceDocument";
import { companyDetails, getInvoice, invoiceAbout } from "@/admin/money";
import { db } from "@/db";
import { approvals, onlinePayments, PAYMENT_METHODS } from "@/db/schema";
import { requireApp } from "@/lib/auth";
import { docLink, receiptLink } from "@/lib/doc-link";
import { jobsForInvoice } from "@/lib/jobs";
import { docQr, invoiceDesign } from "@/lib/invoice-design";
import { payMethods } from "@/lib/payment-methods";

import { requestRefund } from "../../../approval-actions";
import { jobsFromInvoice } from "../../../job-actions";
import { addPayment, invoiceAction } from "../../../money-actions";
import { PrintButton } from "./PrintButton";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ refund?: string; saved?: string }> }) {
  const user = await requireApp("erp", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).money;
  const data = await getInvoice(Number((await params).id));
  if (!data) notFound();
  const { invoice: inv, contact, paid, payments } = data;
  const company = await companyDetails();
  const A = adminDict(lang).approvals;
  const q = await searchParams;
  const [refundFlag, pendingRefunds] = await Promise.all([q.refund,
    db.select().from(approvals).where(eq(approvals.invoiceId, inv.id))]);
  const [attempts, jobs, pay] = await Promise.all([
    db.select().from(onlinePayments).where(eq(onlinePayments.invoiceId, inv.id)).orderBy(desc(onlinePayments.createdAt)),
    jobsForInvoice(inv.id), payMethods()]);
  const [design, qr] = await Promise.all([invoiceDesign(), inv.status === "draft" ? null : docQr(inv.id)]);
  const J = adminDict(lang).jobs;
  const R = adminDict(lang).receipts;
  const p = adminDict(lang).pay;
  const isQuote = inv.kind === "quote";
  const link = docLink(inv.id);
  const wa = whatsappLink(contact.phone);
  const balance = inv.total - paid;
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  const act = (action: string, label: string, cls = "") => (
    <form action={invoiceAction}><input type="hidden" name="id" value={inv.id} /><input type="hidden" name="op" value={action} />
      <button className={`a-btn small ${cls}`}>{label}</button></form>
  );
  return (
    <>
      <div className="a-noprint">
        <p><Link href={`/admin/invoices?tab=${isQuote ? "quote" : "invoice"}`}>← {t.invoices}</Link></p>
        <div className="a-inline a-doc-actions">
          <PrintButton label={t.print} />
          {inv.status === "draft" && <Link className="a-btn small" href={`/admin/invoices/new?edit=${inv.id}`}>✏️ {t.edit}</Link>}
          <Link className="a-btn small" href={`/admin/invoices/new?copy=${inv.id}`}>⧉ {t.duplicate}</Link>
          {inv.status === "draft" && act("send", t.markSent, "primary")}
          {inv.status === "sent" && act("send", t.markSent)}
          {isQuote && ["draft", "sent"].includes(inv.status) && act("accept", t.accept, "primary")}
          {isQuote && ["draft", "sent"].includes(inv.status) && act("decline", t.decline)}
          {!isQuote && ["draft", "sent"].includes(inv.status) && paid === 0 && act("cancel", t.cancel, "danger")}
          <span className={`a-status s-${inv.status === "paid" ? "won" : inv.status === "cancelled" ? "closed" : "working"}`}>{t.statuses[inv.status]}</span>
        </div>
      </div>

      {q.saved && <p className="a-ok a-noprint" role="status">{t.saved}</p>}
      {!["draft", "cancelled"].includes(inv.status) && (
        <section className="a-panel a-noprint">
          <h2>{t.customerLink}</h2>
          <p dir="ltr" className="a-muted" style={{ wordBreak: "break-all" }}>{link}</p>
          {wa && <a className="a-btn wa small" href={`${wa}?text=${encodeURIComponent(fill(t.shareText, { name: contact.name,
            document: isQuote ? t.kinds.quote : t.kinds.invoice, number: inv.number, link }))}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
        </section>
      )}
      {!isQuote && inv.lines.some((l) => l.serviceCode && !l.passThrough) && (
        <section className="a-panel a-noprint">
          <h2>🎬 {J.title}</h2>
          {jobs.length > 0 ? (
            <ul className="a-list">{jobs.map((j) => <li key={j.id}><a href={`/admin/jobs/${j.id}`}><strong dir="ltr">{j.number}</strong> · <span dir="auto">{j.title}</span></a>
              <span className="a-muted">{J.statuses[j.status]}</span></li>)}</ul>
          ) : (
            <form action={jobsFromInvoice}><input type="hidden" name="invoiceId" value={inv.id} /><button className="a-btn">{J.fromInvoice}</button></form>
          )}
        </section>
      )}
      <InvoiceDocument invoice={inv} contact={contact} paid={paid} company={company} pay={pay} design={design} qr={qr} today={today} about={await invoiceAbout(inv)} />

      {!isQuote && (
        <section className="a-panel a-noprint">
          <h2>{t.payments}</h2>
          {payments.length > 0 && (
            <ul className="a-list">
              {payments.map((p) => <li key={p.id}><strong>{money(p.amount, lang)}</strong>
                <span className="a-muted">{dateOnly(p.paidOn, lang)} · {t.methods[p.method]}{p.reference ? ` · ${p.reference}` : ""}
                  {" · "}<a href={receiptLink(p.id)} target="_blank" rel="noreferrer">🧾 {R.receipt}</a></span></li>)}
            </ul>
          )}
          {inv.status !== "cancelled" && balance > 0.0005 && (
            <form action={addPayment} className="a-inline" style={{ marginTop: 12 }}>
              <input type="hidden" name="invoiceId" value={inv.id} />
              <input type="number" name="amount" min={0.001} step="0.001" defaultValue={balance.toFixed(3)} required aria-label={t.amount} />
              <select name="method" aria-label={t.method}>{PAYMENT_METHODS.filter((m) => m !== "online" && m !== "refund").map((m) => <option key={m} value={m}>{t.methods[m]}</option>)}</select>
              <input name="reference" placeholder={t.reference} aria-label={t.reference} />
              <input type="date" name="paidOn" defaultValue={today} required aria-label={t.paidOn} />
              <button className="a-btn small primary">+ {t.addPayment}</button>
            </form>
          )}
        </section>
      )}
      {!isQuote && paid > 0.0005 && (
        <section className="a-panel a-noprint">
          <h2>↩ {A.requestRefund}</h2>
          {refundFlag === "requested" && <p className="a-ok">{A.refundRequested}</p>}
          {refundFlag === "invalid" && <p className="a-alert">{adminDict(lang).site.invalid}</p>}
          {pendingRefunds.length > 0 && (
            <ul className="a-list">{pendingRefunds.map((r) => <li key={r.id}><strong>{money(r.amount, lang)}</strong>
              <span className="a-muted" dir="auto">{r.reason} · {A.statuses[r.status]}</span></li>)}</ul>
          )}
          <form action={requestRefund} className="a-inline" style={{ marginTop: 10 }}>
            <input type="hidden" name="invoiceId" value={inv.id} />
            <input type="number" name="amount" min={0.001} max={paid} step="0.001" required aria-label={A.refundAmount} placeholder={A.refundAmount} />
            <select name="method" aria-label={A.refundMethod}>{(["bank", "cash", "card", "cheque"] as const).map((m) => <option key={m} value={m}>{t.methods[m]}</option>)}</select>
            <input name="reason" required minLength={3} placeholder={A.refundReason} aria-label={A.refundReason} dir="auto" />
            <button className="a-btn small">{A.requestRefund}</button>
          </form>
        </section>
      )}
      {attempts.length > 0 && (
        <section className="a-panel a-noprint">
          <h2>{p.attempts}</h2>
          <ul className="a-list">
            {attempts.map((a) => (
              <li key={a.id}><strong>{p[a.provider]} · {money(a.amount, lang)}</strong>
                <span className="a-muted">{p.statuses[a.status]}{a.live ? "" : ` · ${p.test}`} · {dateOnly(a.createdAt, lang)}{a.transactionId ? ` · ${a.transactionId}` : ""}</span></li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
