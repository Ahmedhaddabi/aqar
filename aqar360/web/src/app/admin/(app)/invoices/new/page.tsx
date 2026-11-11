import { eq, ilike, or } from "drizzle-orm";
import Link from "next/link";

import { adminDict, adminLang, fill } from "@/admin/i18n";
import { serviceChoices } from "@/admin/money";
import { LinesEditor, type StartLine } from "@/admin/money-ui";
import { db } from "@/db";
import { contacts, invoices, properties, requests } from "@/db/schema";
import { requireApp } from "@/lib/auth";
import { defaultVatRate, invoiceDesign } from "@/lib/invoice-design";

import { createInvoice, updateInvoice } from "../../../money-actions";

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
    ilike(contacts.phone, `%${q.trim().replace(/\s/g, "")}%`))).limit(20) : [];
  const [services, design] = await Promise.all([serviceChoices(), invoiceDesign()]);
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
  const heading = editing ? fill(t.editTitle, { number: editing.number }) : kind === "quote" ? t.newQuote : t.newInvoice;
  return (
    <>
      <p><Link href={editing ? `/admin/invoices/${editing.id}` : "/admin/invoices"}>← {editing ? editing.number : t.invoices}</Link></p>
      <header className="a-head"><h1>{heading}</h1></header>
      {error && <p className="a-alert" role="alert">{error === "property" ? t.noProperty : t.formError}</p>}
      {!contact ? (
        <section className="a-panel">
          <form className="a-inline" action="/admin/invoices/new">
            <input type="hidden" name="kind" value={kind} />
            {copy && <input type="hidden" name="copy" value={copy} />}
            <input name="q" defaultValue={q} placeholder={t.chooseCustomer} aria-label={t.chooseCustomer} />
            <button className="a-btn">{t.findCustomer}</button>
          </form>
          <ul className="a-list" style={{ marginTop: 12 }}>
            {found.map((c) => (
              <li key={c.id}><Link href={`/admin/invoices/new?kind=${kind}&contact=${c.id}${copy ? `&copy=${copy}` : ""}`}><strong>{c.name}</strong></Link>
                <span className="a-muted" dir="ltr">{c.phone}</span></li>
            ))}
          </ul>
        </section>
      ) : (
        <form action={editing ? updateInvoice : createInvoice} className="a-form">
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
      )}
    </>
  );
}
