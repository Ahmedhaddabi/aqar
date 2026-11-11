import { desc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";

import { adminDict, adminLang, fill } from "@/admin/i18n";
import { InvoicePreview } from "@/admin/InvoicePreview";
import { companyDetails, serviceChoices } from "@/admin/money";
import { LinesEditor, type StartLine } from "@/admin/money-ui";
import { db } from "@/db";
import { contacts, invoices, properties, requests } from "@/db/schema";
import { requireApp } from "@/lib/auth";
import { defaultVatRate, invoiceDesign } from "@/lib/invoice-design";
import { payMethods } from "@/lib/payment-methods";

import { createInvoice, newBillCustomer, updateInvoice } from "../../../money-actions";

/** New quote or invoice; `?edit=ID` changes a draft, `?copy=ID` starts a new one from an existing quote or invoice. */
export default async function NewInvoicePage({ searchParams }: {
  searchParams: Promise<{ kind?: string; contact?: string; request?: string; q?: string; edit?: string; copy?: string; error?: string }>;
}) {
  const user = await requireApp("erp", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).money;
  const { kind: rawKind, contact: rawContact, request, q, edit, copy, error } = await searchParams;
  const sourceId = Number(edit ?? copy);
  const [source] = Number.isInteger(sourceId) && sourceId > 0 ? await db.select().from(invoices).where(eq(invoices.id, sourceId)) : [];
  const editing = !!edit && source?.status === "draft" ? source : undefined;
  const kind = editing?.kind ?? (rawKind === "quote" ? "quote" : rawKind === "invoice" ? "invoice" : source?.kind ?? "invoice");
  const contactId = Number(rawContact ?? source?.contactId);
  const [contact] = Number.isInteger(contactId) && contactId > 0 ? await db.select().from(contacts).where(eq(contacts.id, contactId)) : [];
  const found = !contact && q?.trim() ? await db.select().from(contacts).where(or(ilike(contacts.name, `%${q.trim()}%`),
    ilike(contacts.phone, `%${q.trim().replace(/\s/g, "")}%`))).limit(20)
    : !contact ? await db.select().from(contacts).orderBy(desc(contacts.updatedAt)).limit(8) : [];
  const searched = !!q?.trim();
  // What was searched becomes the new customer's phone (digits) or name, so nothing is typed twice.
  const qPhone = searched && /^[\d\s+]+$/.test(q!.trim()) ? q!.trim() : "";
  const [services, design, company, pay] = await Promise.all([serviceChoices(), invoiceDesign(), contact ? companyDetails() : null, contact ? payMethods() : undefined]);
  // The property comes from the copied invoice, or from the request the bill is made from (the property the customer wanted).
  const requestId = Number(request);
  const [fromRequest] = !source && Number.isInteger(requestId) && requestId > 0
    ? await db.select({ propertyId: requests.interestPropertyId }).from(requests).where(eq(requests.id, requestId)) : [];
  const propertyId = source?.propertyId ?? fromRequest?.propertyId ?? null;
  const [sourceProperty] = propertyId ? await db.select({ code: properties.code }).from(properties).where(eq(properties.id, propertyId)) : [];
  const choices = services.map((s) => ({ code: s.code, name: lang === "ar" ? s.nameAr : s.nameEn, price: s.price }));
  // A draft keeps its own VAT rate; a new or copied invoice takes today's setting.
  const vatRate = editing && editing.vatRate > 0 ? Number(editing.vatRate) : design.vatRate;
  const chargeVat = editing ? editing.vatRate > 0 : defaultVatRate(design) > 0;
  const start: StartLine[] | undefined = source?.lines;
  // What the preview starts from: the draft itself, or a new one numbered like the real one will be.
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  const preview: typeof invoices.$inferSelect = editing ?? { id: 0, number: `${kind === "quote" ? "QUO" : "INV"}-${today.slice(0, 4)}-·····`, kind,
    contactId: contact?.id ?? 0, requestId: null, propertyId: null, quoteId: null, status: "draft", issueDate: today,
    dueDate: kind === "invoice" ? new Date(Date.parse(today) + design.dueDays * 86_400_000).toISOString().slice(0, 10) : null,
    lines: [], subtotal: 0, discount: 0, vatRate: 0, vatTotal: 0, total: 0, passThroughTotal: 0, notes: "", createdBy: null,
    createdAt: new Date(), updatedAt: new Date() };
  const heading = editing ? fill(t.editTitle, { number: editing.number }) : kind === "quote" ? t.newQuote : t.newInvoice;
  return (
    <>
      <p><Link href={editing ? `/admin/invoices/${editing.id}` : "/admin/invoices"}>← {editing ? editing.number : t.invoices}</Link></p>
      <header className="a-head"><h1>{heading}</h1>
        {contact && <p className="a-muted">{t.usesDesign} <Link href="/admin/invoice-design">{t.design} →</Link></p>}</header>
      {error && <p className="a-alert" role="alert">{error === "property" ? t.noProperty : error === "customer" ? t.customerError : t.formError}</p>}
      {!contact ? (
        <section className="a-panel">
          <p className="a-muted">{t.whoFor}</p>
          <form className="a-inline" action="/admin/invoices/new">
            <input type="hidden" name="kind" value={kind} />
            {copy && <input type="hidden" name="copy" value={copy} />}
            <input name="q" defaultValue={q} placeholder={t.chooseCustomer} aria-label={t.chooseCustomer} />
            <button className="a-btn">{t.findCustomer}</button>
          </form>
          {searched && found.length === 0 && <p className="a-muted" style={{ marginTop: 12 }}>{fill(t.noCustomer, { q: q!.trim() })}</p>}
          {!searched && found.length > 0 && <h2 style={{ marginTop: 16 }}>{t.recentCustomers}</h2>}
          <ul className="a-list" style={{ marginTop: 12 }}>
            {found.map((c) => (
              <li key={c.id}><Link href={`/admin/invoices/new?kind=${kind}&contact=${c.id}${copy ? `&copy=${copy}` : ""}`}><strong>{c.name}</strong></Link>
                <span className="a-muted" dir="ltr">{c.phone}</span></li>
            ))}
          </ul>
          <h2 style={{ marginTop: 16 }}>{t.newCustomer}</h2>
          <form action={newBillCustomer} className="a-inline">
            <input type="hidden" name="kind" value={kind} />
            {copy && <input type="hidden" name="copy" value={copy} />}
            <input name="name" required maxLength={120} dir="auto" placeholder={t.customerName} aria-label={t.customerName}
              defaultValue={searched && !qPhone ? q!.trim() : ""} />
            <input name="phone" type="tel" dir="ltr" maxLength={20} placeholder={t.customerPhone} aria-label={t.customerPhone} defaultValue={qPhone} />
            <button className="a-btn primary">{t.continue}</button>
          </form>
        </section>
      ) : (
        <div className="a-design a-billnew">
        <form id="bill-form" action={editing ? updateInvoice : createInvoice} className="a-form">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="contactId" value={contact.id} />
          {(request ?? source?.requestId) && <input type="hidden" name="requestId" value={request ?? String(source?.requestId)} />}
          <section className="a-panel">
            <p>{t.customer}: <strong>{contact.name}</strong> <span className="a-muted" dir="ltr">{contact.phone}</span>
              {!editing && <> · <Link href={`/admin/invoices/new?kind=${kind}${copy ? `&copy=${copy}` : ""}`}>{t.findCustomer}</Link></>}</p>
            <h2>{t.lines}</h2>
            <LinesEditor t={t} services={choices} lang={lang} initial={start} discount={source?.discount ?? 0} vatRate={vatRate} chargeVat={chargeVat} />
            <div className="a-grid-fields" style={{ marginTop: 12 }}>
              {kind === "invoice" && (
                <label className="a-field"><span>{t.due}</span><input type="date" name="dueDate" defaultValue={editing?.dueDate ?? ""} />
                  <small>{fill(t.dueHelp, { days: design.dueDays })}</small></label>
              )}
              <label className="a-field"><span>{t.forProperty}</span><input name="propertyCode" dir="ltr" maxLength={40} defaultValue={sourceProperty?.code ?? ""}
                placeholder="APT-2041" /><small>{t.forPropertyHelp}</small></label>
              <label className="a-field"><span>{t.billVat}</span><input name="customerVat" dir="ltr" maxLength={40} defaultValue={contact.vatNumber} /></label>
              <label className="a-field wide"><span>{t.billAddress}</span><input name="customerAddress" dir="auto" maxLength={300} defaultValue={contact.address} />
                <small>{t.billSaved}</small></label>
              <label className="a-field wide"><span>{t.notes}</span><textarea name="notes" rows={2} defaultValue={source?.notes ?? ""} /></label>
            </div>
          </section>
          <div className="a-savebar"><button className="a-btn primary">{editing ? t.saveChanges : t.create}</button></div>
        </form>
        <InvoicePreview formId="bill-form" base={preview} contact={contact} company={company!} pay={pay} design={design} today={today} label={t.preview} />
        </div>
      )}
    </>
  );
}
