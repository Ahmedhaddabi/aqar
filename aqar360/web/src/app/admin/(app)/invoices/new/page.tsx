import { eq, ilike, or } from "drizzle-orm";
import Link from "next/link";

import { adminDict, adminLang } from "@/admin/i18n";
import { serviceChoices } from "@/admin/money";
import { LinesEditor } from "@/admin/money-ui";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { requireApp } from "@/lib/auth";

import { createInvoice } from "../../../money-actions";

export default async function NewInvoicePage({ searchParams }: {
  searchParams: Promise<{ kind?: string; contact?: string; request?: string; q?: string }>;
}) {
  const user = await requireApp("erp", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).money;
  const { kind: rawKind, contact: rawContact, request, q } = await searchParams;
  const kind = rawKind === "quote" ? "quote" : "invoice";
  const contactId = Number(rawContact);
  const [contact] = Number.isInteger(contactId) && contactId > 0 ? await db.select().from(contacts).where(eq(contacts.id, contactId)) : [];
  const found = !contact && q?.trim() ? await db.select().from(contacts).where(or(ilike(contacts.name, `%${q.trim()}%`),
    ilike(contacts.phone, `%${q.trim().replace(/\s/g, "")}%`))).limit(20) : [];
  const services = (await serviceChoices()).map((s) => ({ code: s.code, name: lang === "ar" ? s.nameAr : s.nameEn, price: s.price }));
  return (
    <>
      <p><Link href="/admin/invoices">← {t.invoices}</Link></p>
      <header className="a-head"><h1>{kind === "quote" ? t.newQuote : t.newInvoice}</h1></header>
      {!contact ? (
        <section className="a-panel">
          <form className="a-inline" action="/admin/invoices/new">
            <input type="hidden" name="kind" value={kind} />
            <input name="q" defaultValue={q} placeholder={t.chooseCustomer} aria-label={t.chooseCustomer} />
            <button className="a-btn">{t.findCustomer}</button>
          </form>
          <ul className="a-list" style={{ marginTop: 12 }}>
            {found.map((c) => (
              <li key={c.id}><Link href={`/admin/invoices/new?kind=${kind}&contact=${c.id}`}><strong>{c.name}</strong></Link>
                <span className="a-muted" dir="ltr">{c.phone}</span></li>
            ))}
          </ul>
        </section>
      ) : (
        <form action={createInvoice} className="a-form">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="contactId" value={contact.id} />
          {request && <input type="hidden" name="requestId" value={request} />}
          <section className="a-panel">
            <p>{t.customer}: <strong>{contact.name}</strong> <span className="a-muted" dir="ltr">{contact.phone}</span></p>
            <h2>{t.lines}</h2>
            <LinesEditor t={t} services={services} lang={lang} />
            <div className="a-grid-fields" style={{ marginTop: 12 }}>
              {kind === "invoice" && <label className="a-field"><span>{t.due}</span><input type="date" name="dueDate" /></label>}
              <label className="a-field wide"><span>{t.notes}</span><textarea name="notes" rows={2} /></label>
            </div>
          </section>
          <div className="a-savebar"><button className="a-btn primary">{t.create}</button></div>
        </form>
      )}
    </>
  );
}
