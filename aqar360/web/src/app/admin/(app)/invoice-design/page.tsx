import Link from "next/link";
import QRCode from "qrcode";

import { adminDict, adminLang } from "@/admin/i18n";
import { InvoiceDocument } from "@/admin/InvoiceDocument";
import { Field, Toggle } from "@/admin/ListingParts";
import { companyDetails } from "@/admin/money";
import type { contacts, invoices } from "@/db/schema";
import { requireApp } from "@/lib/auth";
import { siteUrl } from "@/lib/config";
import { defaultVatRate, invoiceDesign, TEMPLATES } from "@/lib/invoice-design";
import { invoiceTotals } from "@/lib/invoice-math";
import { payMethods } from "@/lib/payment-methods";

import { saveInvoiceDesign } from "../../invoice-design-actions";

/** ERP → Invoice design: logo, colour, layout, stamp, VAT and wording, with a preview of a sample invoice. */
export default async function InvoiceDesignPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireApp("erp", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).invoiceDesign;
  const q = await searchParams;
  const [design, company, pay] = await Promise.all([invoiceDesign(), companyDetails(), payMethods()]);
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  const lines = [{ description: t.sampleLine1, qty: 1, unitPrice: 350 }, { description: t.sampleLine2, qty: 1, unitPrice: 200, passThrough: true }];
  const totals = invoiceTotals(lines, 25, defaultVatRate(design));
  const sample: typeof invoices.$inferSelect = { id: 0, number: `INV-${today.slice(0, 4)}-00001`, kind: "invoice", contactId: 0, requestId: null, propertyId: null,
    quoteId: null, status: "sent", issueDate: today, dueDate: new Date(Date.parse(today) + design.dueDays * 86_400_000).toISOString().slice(0, 10),
    lines, subtotal: totals.subtotal, discount: totals.discount, vatRate: defaultVatRate(design), vatTotal: totals.vatTotal, total: totals.total,
    passThroughTotal: totals.media, notes: "", createdBy: null, createdAt: new Date(), updatedAt: new Date() };
  const customer = { id: 0, name: t.sample, phone: "+968 9000 0000", email: "customer@example.com" } as typeof contacts.$inferSelect;
  return (
    <>
      <header className="a-head"><h1>{t.title}</h1><p className="a-muted">{t.intro}</p></header>
      {q.saved && <p className="a-ok" role="status">{t.saved}</p>}
      {q.error && <p className="a-alert" role="alert">{q.error === "upload" ? t.uploadError : adminDict(lang).site.invalid}</p>}
      <div className="a-design">
        <form action={saveInvoiceDesign} className="a-form">
          <section className="a-panel">
            <h2>{t.brand}</h2>
            <div className="a-field"><span>{t.logo}</span>
              <div className="a-brandimg">{design.logoUrl && <img src={design.logoUrl} alt="" />}<input type="file" name="logo" accept="image/png,image/jpeg,image/webp" /></div>
              {design.logoUrl && <label className="a-check"><input type="checkbox" name="logoRemove" /> {t.remove}</label>}
            </div>
            <div className="a-field"><span>{t.color}</span>
              <div className="a-swatches"><input type="color" name="invoiceColor" defaultValue={design.color} aria-label={t.color} /></div>
            </div>
            <Field label={t.template}>
              <select name="invoiceTemplate" defaultValue={design.template}>{TEMPLATES.map((k) => <option key={k} value={k}>{t.templates[k]}</option>)}</select>
            </Field>
            <div className="a-field"><span>{t.stamp}</span>
              <div className="a-brandimg">{design.stampUrl && <img src={design.stampUrl} alt="" />}<input type="file" name="stamp" accept="image/png,image/jpeg,image/webp" /></div>
              {design.stampUrl && <label className="a-check"><input type="checkbox" name="stampRemove" /> {t.remove}</label>}
            </div>
          </section>
          <section className="a-panel">
            <h2>{t.tax}</h2>
            <Toggle name="vatEnabled" label={t.vatEnabled} help={t.vatHelp} checked={design.vatEnabled} />
            <Field label={t.vatRate}><input type="number" name="vatRate" min={0} max={100} step="0.01" defaultValue={design.vatRate} required /></Field>
            <p className="a-muted"><Link href="/admin/settings">{t.vatNumber}</Link></p>
          </section>
          <section className="a-panel">
            <h2>{t.content}</h2>
            <Field label={t.termsEn}><textarea name="invoiceTermsEn" rows={3} defaultValue={design.termsEn} dir="ltr" maxLength={1500} /></Field>
            <Field label={t.termsAr}><textarea name="invoiceTermsAr" rows={3} defaultValue={design.termsAr} dir="rtl" maxLength={1500} /></Field>
            <Field label={t.footerEn} help={t.footerHelp}><input name="invoiceFooterEn" defaultValue={design.footerEn} dir="ltr" maxLength={300} /></Field>
            <Field label={t.footerAr}><input name="invoiceFooterAr" defaultValue={design.footerAr} dir="rtl" maxLength={300} /></Field>
          </section>
          <section className="a-panel">
            <h2>{t.defaults}</h2>
            <Field label={t.dueDays}><input type="number" name="invoiceDueDays" min={0} max={365} defaultValue={design.dueDays} required /></Field>
            <Field label={t.quoteDays}><input type="number" name="quoteValidDays" min={1} max={365} defaultValue={design.quoteValidDays} required /></Field>
            <Toggle name="invoiceShowQr" label={t.showQr} checked={design.showQr} />
            <Toggle name="invoiceShowWords" label={t.showWords} checked={design.showWords} />
          </section>
          <div className="a-savebar"><button className="a-btn primary">{t.save}</button></div>
        </form>
        <section className="a-design-preview" aria-label={adminDict(lang).money.preview}>
          <InvoiceDocument invoice={sample} contact={customer} paid={0} company={company} pay={pay} design={design} today={today}
            qr={design.showQr ? await QRCode.toDataURL(siteUrl, { margin: 1, width: 224 }).catch(() => null) : null} />
        </section>
      </div>
    </>
  );
}

