import Link from "next/link";

import { dateOnly, money } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { type InvoiceTab, listInvoices } from "@/admin/money";
import { requireApp } from "@/lib/auth";

const TABS: InvoiceTab[] = ["invoice", "quote", "unpaid"];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ tab?: string; error?: string }> }) {
  const user = await requireApp("erp", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).money;
  const { tab: raw, error } = await searchParams;
  const tab = (TABS as string[]).includes(raw ?? "") ? (raw as InvoiceTab) : "invoice";
  const rows = await listInvoices(tab);
  const outstanding = rows.filter((r) => r.invoice.kind === "invoice" && ["sent", "partly_paid"].includes(r.invoice.status))
    .reduce((a, r) => a + r.invoice.total - r.paid, 0);
  return (
    <>
      <header className="a-head a-request-head">
        <div><h1>{t.invoices}</h1><p className="a-muted">{t.intro}</p></div>
        <div className="a-inline">
          <Link className="a-btn" href="/admin/invoices/new?kind=quote">+ {t.newQuote}</Link>
          <Link className="a-btn primary" href="/admin/invoices/new?kind=invoice">+ {t.newInvoice}</Link>
        </div>
      </header>
      {error === "invalid" && <p className="a-alert" role="alert">{adminDict(lang).site.invalid}</p>}
      <div className="a-toolbar">
        <nav className="a-tabs">
          {TABS.map((k) => <Link key={k} href={`/admin/invoices?tab=${k}`} aria-current={k === tab ? "page" : undefined}>{t.tabs[k]}</Link>)}
        </nav>
        {tab !== "quote" && <p className="a-muted">{t.outstanding}: <strong>{money(outstanding, lang)}</strong></p>}
      </div>
      <section className="a-panel">
        {rows.length === 0 ? <p className="a-muted">{t.none} <Link className="a-btn small primary" href={`/admin/invoices/new?kind=${tab === "quote" ? "quote" : "invoice"}`}>+ {tab === "quote" ? t.newQuote : t.newInvoice}</Link></p> : (
          <table className="a-table">
            <thead><tr><th>{t.number}</th><th>{t.customer}</th><th>{t.date}</th><th>{t.total}</th><th>{t.balance}</th><th>{t.status}</th></tr></thead>
            <tbody>
              {rows.map(({ invoice: inv, customer, paid }) => (
                <tr key={inv.id}>
                  <td data-label={t.number}><Link className="a-row-link" href={`/admin/invoices/${inv.id}`}><strong dir="ltr">{inv.number}</strong></Link></td>
                  <td data-label={t.customer}>{customer}</td>
                  <td data-label={t.date}>{dateOnly(inv.issueDate, lang)}</td>
                  <td data-label={t.total}>{money(inv.total, lang)}</td>
                  <td data-label={t.balance}>{inv.kind === "invoice" ? money(inv.total - paid, lang) : ""}</td>
                  <td data-label={t.status}><span className={`a-status s-${inv.status === "paid" || inv.status === "accepted" ? "won"
                    : inv.status === "cancelled" || inv.status === "declined" ? "closed" : inv.status === "draft" ? "new" : "working"}`}>{t.statuses[inv.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
