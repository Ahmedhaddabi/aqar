// The printable quote / invoice: bilingual so one copy serves Arabic- and English-speaking customers.
import type { contacts, invoices } from "@/db/schema";
import type { PayMethods } from "@/lib/payment-methods";

import type { companyDetails } from "./money";

const n3 = (v: number) => new Intl.NumberFormat("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v);

export function InvoiceDocument({ invoice: inv, contact, paid, company, pay }: {
  invoice: typeof invoices.$inferSelect; contact: typeof contacts.$inferSelect; paid: number;
  company: Awaited<ReturnType<typeof companyDetails>>; pay?: PayMethods;
}) {
  const isQuote = inv.kind === "quote";
  const balance = inv.total - paid;
  return (
    <article className="a-doc">
      <header className="a-doc-head">
        <div>
          <h2>{company.nameEn}</h2>
          <p>{company.address}</p>
          {company.cr && <p>CR: {company.cr}</p>}
          {company.vat && <p>VAT: {company.vat}</p>}
          <p dir="ltr">{[company.phone, company.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="a-doc-title">
          <h1>{isQuote ? "QUOTATION · عرض سعر" : "INVOICE · فاتورة"}</h1>
          <p dir="ltr"><strong>{inv.number}</strong></p>
          <p>Date / التاريخ: {inv.issueDate}</p>
          {inv.dueDate && <p>Due / الاستحقاق: {inv.dueDate}</p>}
        </div>
        <div dir="rtl" className="a-doc-ar"><h2>{company.nameAr}</h2></div>
      </header>
      <section className="a-doc-bill">
        <p className="a-muted">Bill to / الفاتورة إلى</p>
        <p><strong>{contact.name}</strong></p>
        <p dir="ltr">{[contact.phone, contact.email].filter(Boolean).join(" · ")}</p>
      </section>
      <table className="a-doc-table">
        <thead><tr><th>Description / الوصف</th><th>Qty / الكمية</th><th>Unit price / السعر</th><th>Total / المجموع</th></tr></thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i}><td dir="auto">{l.description}{l.passThrough ? " *" : ""}</td><td>{l.qty}</td><td>{n3(l.unitPrice)}</td><td>{n3(l.qty * l.unitPrice)}</td></tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={3}>Total / الإجمالي (OMR)</td><td><strong>{n3(inv.total)}</strong></td></tr>
          {!isQuote && paid > 0 && <tr><td colSpan={3}>Paid / المدفوع</td><td>{n3(paid)}</td></tr>}
          {!isQuote && paid > 0 && <tr><td colSpan={3}>Balance / المتبقي</td><td><strong>{n3(balance)}</strong></td></tr>}
        </tfoot>
      </table>
      {inv.passThroughTotal > 0 && <p className="a-doc-note">* Includes client media money held for the campaign (not a fee). / يشمل أموالا إعلانية للعميل محفوظة للحملة (ليست رسوما).</p>}
      {inv.notes && <p className="a-doc-note" dir="auto">{inv.notes}</p>}
      {pay && !isQuote && balance > 0.0005 && (
        <section className="a-doc-pay">
          <h3>How to pay / طرق الدفع</h3>
          {pay.bank && (pay.iban || pay.accountNumber) && (
            <p><strong>Bank transfer / تحويل بنكي:</strong> {[pay.bankName, pay.accountName, pay.accountNumber && `A/C ${pay.accountNumber}`,
              pay.iban && `IBAN ${pay.iban}`, pay.swift && `SWIFT ${pay.swift}`].filter(Boolean).join(" · ")}. Reference / المرجع: <strong>{inv.number}</strong></p>
          )}
          {(pay.cash || pay.card) && <p>{[pay.cash && "Cash at our office / نقدا في المكتب", pay.card && "Card at our office / بطاقة في المكتب"].filter(Boolean).join(" · ")}</p>}
          {pay.cheque && <p>Cheque / شيك{pay.chequePayee ? `: ${pay.chequePayee}` : ""}</p>}
          {(pay.noteEn || pay.noteAr) && <p>{[pay.noteEn, pay.noteAr].filter(Boolean).join(" / ")}</p>}
        </section>
      )}
      <p className="a-doc-note">{isQuote ? "This quote is valid for 30 days. / هذا العرض صالح لمدة 30 يوما." : "Thank you for your business. / شكرا لتعاملكم معنا."}</p>
    </article>
  );
}
