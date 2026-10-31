import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { companyDetails } from "@/admin/money";
import { db } from "@/db";
import { contacts, invoices, payments } from "@/db/schema";
import { validReceiptLink } from "@/lib/doc-link";

import { PrintButton } from "../../../admin/(app)/invoices/[id]/PrintButton";

const METHODS: Record<string, string> = { bank: "Bank transfer / تحويل بنكي", cash: "Cash / نقدا", card: "Card / بطاقة", cheque: "Cheque / شيك",
  online: "Online payment / دفع إلكتروني", refund: "Refund / استرداد" };
const n3 = (v: number) => v.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** Payment receipt (strategy §9.1: Invoice → Payment → Receipt), bilingual like the invoice. */
export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ s?: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !validReceiptLink(id, (await searchParams).s)) notFound();
  const [row] = await db.select({ p: payments, inv: invoices, c: contacts }).from(payments).innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .innerJoin(contacts, eq(invoices.contactId, contacts.id)).where(eq(payments.id, id));
  if (!row) notFound();
  const company = await companyDetails();
  const refund = row.p.amount < 0;
  const number = `${refund ? "CN" : "RCT"}-${row.inv.number.replace(/^INV-/, "")}-${row.p.id}`;
  return (
    <>
      <title>{number}</title>
      <div className="a-noprint a-doc-actions"><PrintButton label="Print / save PDF · طباعة / حفظ PDF" /></div>
      <article className="a-doc">
        <header className="a-doc-head">
          <div><h2>{company.nameEn}</h2><p>{company.address}</p>{company.cr && <p>CR: {company.cr}</p>}{company.vat && <p>VAT: {company.vat}</p>}</div>
          <div className="a-doc-title"><h1>{refund ? "CREDIT NOTE · إشعار دائن" : "RECEIPT · إيصال"}</h1><p dir="ltr"><strong>{number}</strong></p><p>Date / التاريخ: {row.p.paidOn}</p></div>
          <div dir="rtl" className="a-doc-ar"><h2>{company.nameAr}</h2></div>
        </header>
        <section className="a-doc-bill"><p className="a-muted">{refund ? "Refunded to / تم الاسترداد إلى" : "Received from / استلمنا من"}</p><p><strong>{row.c.name}</strong></p></section>
        <table className="a-doc-table">
          <tbody>
            <tr><td>Invoice / الفاتورة</td><td dir="ltr">{row.inv.number}</td></tr>
            <tr><td>Method / طريقة الدفع</td><td>{METHODS[row.p.method] ?? row.p.method}</td></tr>
            {row.p.reference && <tr><td>Reference / المرجع</td><td dir="ltr">{row.p.reference}</td></tr>}
          </tbody>
          <tfoot><tr><td>{refund ? "Amount refunded (OMR) / المبلغ المسترد" : "Amount received (OMR) / المبلغ المستلم"}</td><td><strong>{n3(Math.abs(row.p.amount))}</strong></td></tr></tfoot>
        </table>
        <p className="a-doc-note">Thank you. / شكرا لك.</p>
      </article>
    </>
  );
}
