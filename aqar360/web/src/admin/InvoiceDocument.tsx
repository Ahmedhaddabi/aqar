// The printable quote / invoice: bilingual so one copy serves Arabic- and English-speaking customers.
// Looks are set in ERP → Invoice design (logo, colour, layout, stamp, terms, VAT); totals come from the invoice itself.
import type { CSSProperties } from "react";

import type { contacts, invoices } from "@/db/schema";
import type { InvoiceDesign } from "@/lib/invoice-design";
import { amountInWords } from "@/lib/invoice-math";
import type { PayMethods } from "@/lib/payment-methods";

import type { companyDetails } from "./money";

const n3 = (v: number) => new Intl.NumberFormat("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v);
const day = (v: string | null) => (v ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(v)) : "");

type Stamp = { en: string; ar: string; tone: "ok" | "warn" | "danger" | "muted" };

function stampFor(inv: typeof invoices.$inferSelect, balance: number, today: string): Stamp | null {
  if (inv.status === "cancelled") return { en: "CANCELLED", ar: "ملغاة", tone: "muted" };
  if (inv.kind === "quote") {
    if (inv.status === "accepted") return { en: "ACCEPTED", ar: "مقبول", tone: "ok" };
    if (inv.status === "declined") return { en: "DECLINED", ar: "مرفوض", tone: "muted" };
    return null;
  }
  if (inv.status === "draft") return { en: "DRAFT", ar: "مسودة", tone: "muted" };
  if (inv.status === "paid" || balance <= 0.0005) return { en: "PAID", ar: "مدفوعة", tone: "ok" };
  if (inv.dueDate && inv.dueDate < today) return { en: "OVERDUE", ar: "متأخرة", tone: "danger" };
  if (inv.status === "partly_paid") return { en: "PARTLY PAID", ar: "مدفوعة جزئيا", tone: "warn" };
  return null;
}

export type InvoiceAbout = { property: { en: string; ar: string; code: string } | null; request: string | null } | null;

export function InvoiceDocument({ invoice: inv, contact, paid, company, pay, design, qr, today, about }: {
  invoice: typeof invoices.$inferSelect; contact: typeof contacts.$inferSelect; paid: number;
  company: Awaited<ReturnType<typeof companyDetails>>; pay?: PayMethods; design: InvoiceDesign;
  /** data: URL of a QR code for the customer's online copy (where they can pay). */
  qr?: string | null; today: string;
  /** The property and request the bill is for (invoiceAbout in money.ts). */
  about?: InvoiceAbout;
}) {
  const isQuote = inv.kind === "quote";
  const balance = inv.total - paid;
  const taxed = inv.vatTotal > 0;
  const subtotal = inv.subtotal || inv.total; // invoices made before subtotals existed
  const stamp = stampFor(inv, balance, today);
  const title = isQuote ? ["QUOTATION", "عرض سعر"] : taxed ? ["TAX INVOICE", "فاتورة ضريبية"] : ["INVOICE", "فاتورة"];
  const validUntil = isQuote ? new Date(Date.parse(inv.issueDate) + design.quoteValidDays * 86_400_000).toISOString().slice(0, 10) : null;
  const showPay = !!pay && !isQuote && balance > 0.0005 && inv.status !== "cancelled";
  const rows: [string, string, number, string?][] = [
    ["Subtotal", "المجموع الفرعي", subtotal],
    ...(inv.discount > 0 ? [["Discount", "الخصم", -inv.discount] as [string, string, number]] : []),
    ...(taxed ? [[`VAT ${Number(inv.vatRate)}%`, "ضريبة القيمة المضافة", inv.vatTotal] as [string, string, number]] : []),
  ];
  return (
    <article className={`inv inv-${design.template}`} style={{ "--brand": design.color } as CSSProperties} dir="ltr">
      <header className="inv-head">
        <div className="inv-brand">
          {design.logoUrl && <img src={design.logoUrl} alt={company.nameEn} className="inv-logo" />}
          <div>
            <strong>{company.nameEn}</strong>
            <span dir="rtl">{company.nameAr}</span>
          </div>
        </div>
        <div className="inv-title">
          <h1>{title[0]}</h1>
          <p dir="rtl">{title[1]}</p>
        </div>
      </header>

      <section className="inv-meta">
        <div>
          <h3>From <span dir="rtl">من</span></h3>
          {company.address && <p dir="auto">{company.address}</p>}
          {company.cr && <p>CR / السجل التجاري: <span dir="ltr">{company.cr}</span></p>}
          {company.vat && <p>VATIN / الرقم الضريبي: <span dir="ltr">{company.vat}</span></p>}
          {company.phone && <p dir="ltr">{company.phone}</p>}
          {company.email && <p dir="ltr">{company.email}</p>}
        </div>
        <div>
          <h3>{isQuote ? "Prepared for" : "Bill to"} <span dir="rtl">{isQuote ? "مقدم إلى" : "الفاتورة إلى"}</span></h3>
          <p className="inv-strong" dir="auto">{contact.name}</p>
          {contact.phone && <p dir="ltr">{contact.phone}</p>}
          {contact.email && <p dir="ltr">{contact.email}</p>}
          {contact.address && <p dir="auto" className="inv-address">{contact.address}</p>}
          {contact.vatNumber && <p>VATIN / الرقم الضريبي: <span dir="ltr">{contact.vatNumber}</span></p>}
          {about?.property && <p className="inv-for">For / بخصوص: <bdi dir="ltr"><strong>{about.property.code}</strong></bdi> · <bdi dir="ltr">{about.property.en}</bdi>
            {about.property.ar && <> · <bdi dir="rtl">{about.property.ar}</bdi></>}</p>}
          {about?.request && <p className="inv-for">Ref. / المرجع: <span dir="ltr">{about.request}</span></p>}
        </div>
        <div className="inv-side">
        <dl className="inv-facts">
          <dt>No. <span dir="rtl">الرقم</span></dt><dd dir="ltr"><strong>{inv.number}</strong></dd>
          <dt>Date <span dir="rtl">التاريخ</span></dt><dd>{day(inv.issueDate)}</dd>
          {inv.dueDate && !isQuote && <><dt>Due <span dir="rtl">الاستحقاق</span></dt><dd>{day(inv.dueDate)}</dd></>}
          {validUntil && <><dt>Valid until <span dir="rtl">صالح حتى</span></dt><dd>{day(validUntil)}</dd></>}
        </dl>
        {stamp && <div className={`inv-stamp ${stamp.tone}`}><span>{stamp.en}</span><span dir="rtl">{stamp.ar}</span></div>}
        </div>
      </section>

      <table className="inv-table">
        <thead>
          <tr><th>#</th><th>Description <span dir="rtl">الوصف</span></th><th>Qty <span dir="rtl">الكمية</span></th>
            <th>Unit price <span dir="rtl">سعر الوحدة</span></th><th>Amount (OMR) <span dir="rtl">المبلغ</span></th></tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i}><td>{i + 1}</td><td dir="auto">{l.description}{l.passThrough ? " *" : ""}</td><td>{l.qty}</td>
              <td>{n3(l.unitPrice)}</td><td>{n3(l.qty * l.unitPrice)}</td></tr>
          ))}
        </tbody>
      </table>

      <div className="inv-sum">
        <div className="inv-words">
          {design.showWords && (
            <>
              <h3>Amount in words <span dir="rtl">المبلغ كتابة</span></h3>
              <p>{amountInWords(inv.total, "en")}</p>
              <p dir="rtl">{amountInWords(inv.total, "ar")}</p>
            </>
          )}
          {inv.passThroughTotal > 0 && (
            <div className="inv-note">
              <p>* Client media money held for the campaign: not a fee, no VAT.</p>
              <p dir="rtl">* أموال إعلانية للعميل محفوظة للحملة: ليست رسوما ولا تخضع للضريبة.</p>
            </div>
          )}
        </div>
        <table className="inv-totals">
          <tbody>
            {rows.map(([en, ar, v]) => <tr key={en}><th>{en} <span dir="rtl">{ar}</span></th><td>{n3(v)}</td></tr>)}
            <tr className="inv-grand"><th>Total (OMR) <span dir="rtl">الإجمالي</span></th><td>{n3(inv.total)}</td></tr>
            {!isQuote && paid > 0.0005 && <tr><th>Paid <span dir="rtl">المدفوع</span></th><td>{n3(-paid)}</td></tr>}
            {!isQuote && paid > 0.0005 && <tr className="inv-due"><th>Balance due <span dir="rtl">المتبقي</span></th><td>{n3(Math.max(balance, 0))}</td></tr>}
          </tbody>
        </table>
      </div>

      {inv.notes && <p className="inv-notes" dir="auto">{inv.notes}</p>}

      <section className="inv-foot">
        <div className="inv-pay">
          {showPay && (
            <>
              <h3>How to pay <span dir="rtl">طرق الدفع</span></h3>
              {pay!.bank && (pay!.iban || pay!.accountNumber) && (
                <p><strong>Bank transfer / تحويل بنكي:</strong> {[pay!.bankName, pay!.accountName, pay!.accountNumber && `A/C ${pay!.accountNumber}`,
                  pay!.iban && `IBAN ${pay!.iban}`, pay!.swift && `SWIFT ${pay!.swift}`].filter(Boolean).join(" · ")}. Reference / المرجع: <strong>{inv.number}</strong></p>
              )}
              {(pay!.cash || pay!.card) && <p>{[pay!.cash && "Cash at our office / نقدا في المكتب", pay!.card && "Card at our office / بطاقة في المكتب"].filter(Boolean).join(" · ")}</p>}
              {pay!.cheque && <p>Cheque / شيك{pay!.chequePayee ? `: ${pay!.chequePayee}` : ""}</p>}
              {(pay!.noteEn || pay!.noteAr) && <p>{[pay!.noteEn, pay!.noteAr].filter(Boolean).join(" / ")}</p>}
            </>
          )}
          {(design.termsEn || design.termsAr) && (
            <>
              <h3>Terms <span dir="rtl">الشروط</span></h3>
              {design.termsEn && <p className="inv-pre">{design.termsEn}</p>}
              {design.termsAr && <p className="inv-pre" dir="rtl">{design.termsAr}</p>}
            </>
          )}
        </div>
        {design.showQr && qr && (
          <figure className="inv-qr">
            <img src={qr} alt="QR code" width={112} height={112} />
            <figcaption>{showPay ? "Scan to view and pay" : "Scan to view online"}<br /><span dir="rtl">{showPay ? "امسح للعرض والدفع" : "امسح للعرض"}</span></figcaption>
          </figure>
        )}
        {design.stampUrl && (
          <figure className="inv-sign">
            <img src={design.stampUrl} alt="Company stamp" />
            <figcaption>Authorised signature <span dir="rtl">التوقيع المعتمد</span></figcaption>
          </figure>
        )}
      </section>

      <footer className="inv-footer">
        <p>{design.footerEn || (isQuote ? `This quote is valid for ${design.quoteValidDays} days.` : "Thank you for your business.")}</p>
        <p dir="rtl">{design.footerAr || (isQuote ? `هذا العرض صالح لمدة ${design.quoteValidDays} يوما.` : "شكرا لتعاملكم معنا.")}</p>
      </footer>
    </article>
  );
}
