import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AgreementsPanel } from "@/admin/AgreementsPanel";
import { CustomerSummary, IdScan } from "@/admin/AiParts";
import { getCustomer } from "@/admin/crm";
import { dateOnly, dateTime, whatsappLink } from "@/admin/format";
import { adminDict, adminLang, fill } from "@/admin/i18n";
import { Documents } from "@/admin/Documents";
import { Timeline } from "@/admin/Timeline";
import { db } from "@/db";
import { customerAccounts, invoices, serviceJobs } from "@/db/schema";
import { aiReady } from "@/lib/ai";
import { canOpen } from "@/lib/auth";
import { portalLink } from "@/lib/doc-link";
import { requireApp } from "@/lib/auth";
import { consentSummary } from "@/lib/intake";

import { linkWebAccount, updateCustomer } from "../../../crm-actions";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ existing?: string }> }) {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const t = adminDict(lang).crm;
  const m = adminDict(lang).money;
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await getCustomer(user, id) : null;
  if (!data) notFound();
  const { contact: c, requests, timeline } = data;
  const erp = canOpen(user, "erp") && user.role !== "agent";
  const [consent, docs, jobs] = await Promise.all([consentSummary(c.id),
    erp ? db.select().from(invoices).where(eq(invoices.contactId, c.id)).orderBy(desc(invoices.createdAt)).limit(30) : Promise.resolve([]),
    db.select().from(serviceJobs).where(eq(serviceJobs.contactId, c.id)).orderBy(desc(serviceJobs.createdAt)).limit(30)]);
  const T2 = adminDict(lang);
  const aiOn = await aiReady();
  const portal = portalLink(c.id);
  const same = [c.phone ? eq(customerAccounts.phone, c.phone) : null, c.email ? sql`${customerAccounts.email} = lower(${c.email})` : null].filter((x) => x !== null);
  const [webLinked, webMatches] = await Promise.all([
    db.select().from(customerAccounts).where(eq(customerAccounts.contactId, c.id)).limit(1),
    same.length ? db.select().from(customerAccounts).where(and(isNull(customerAccounts.contactId), or(...same))).limit(5) : Promise.resolve([]),
  ]);
  const manager = user.role === "admin" || user.role === "manager";
  const wa = whatsappLink(c.phone);
  return (
    <>
      <p><Link href="/admin/customers">← {t.customers}</Link></p>
      <header className="a-head">
        <h1>{c.name}</h1>
        <p className="a-muted">{t.since} {dateOnly(c.createdAt, lang)}</p>
        {aiOn && <CustomerSummary t={T2.ai} contactId={c.id} />}
        <div className="a-contact-buttons">
          {c.phone && <a className="a-btn primary" href={`tel:${c.phone}`}>📞 {t.call}</a>}
          {wa && <a className="a-btn wa" href={wa} target="_blank" rel="noreferrer">💬 {t.whatsapp}</a>}
          {c.email && <a className="a-btn" href={`mailto:${c.email}`}>✉ {t.email}</a>}
          {user.role !== "agent" && <>
            <Link className="a-btn" href={`/admin/invoices/new?kind=quote&contact=${c.id}`}>+ {m.newQuote}</Link>
            <Link className="a-btn" href={`/admin/invoices/new?kind=invoice&contact=${c.id}`}>+ {m.newInvoice}</Link>
          </>}
        </div>
      </header>
      {(await searchParams).existing && <p className="a-ok">{fill(T2.entry.existing, { name: c.name })}</p>}
      <div className="a-two">
        <div>
          <section className="a-panel">
            <h2>{t.requests}</h2>
            <table className="a-table">
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/admin/requests/${r.id}`}><strong>{r.number}</strong></Link><div className="a-muted">{t.kinds[r.kind]}</div></td>
                    <td><span className={`a-status s-${r.status}`}>{t.statuses[r.status]}</span></td>
                    <td>{r.owner ?? <span className="a-muted">{t.unassigned}</span>}</td>
                    <td className="a-muted">{dateTime(r.createdAt, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {erp && docs.length > 0 && (
            <section className="a-panel">
              <h2>🧾 {m.invoices}</h2>
              <ul className="a-list">{docs.map((d) => (
                <li key={d.id}><Link href={`/admin/invoices/${d.id}`}><strong dir="ltr">{d.number}</strong> · {m.kinds[d.kind]}</Link>
                  <span className="a-muted">{d.total.toFixed(3)} OMR · {m.statuses[d.status]}</span></li>))}</ul>
            </section>
          )}
          <section className="a-panel">
            <div className="a-panel-head"><h2>🎬 {T2.jobs.title}</h2>
              {erp && <Link className="a-btn small" href={`/admin/jobs/new?contact=${c.id}`}>+ {T2.jobs.newJob}</Link>}</div>
            {jobs.length === 0 ? <p className="a-muted">{T2.jobs.none}</p> : (
              <ul className="a-list">{jobs.map((j) => (
                <li key={j.id}><Link href={`/admin/jobs/${j.id}`}><strong dir="ltr">{j.number}</strong> · <span dir="auto">{j.title}</span></Link>
                  <span className="a-muted">{T2.jobs.statuses[j.status]}</span></li>))}</ul>
            )}
          </section>
          <Timeline rows={timeline} t={t} lang={lang} contactId={c.id} showRequest />
          <Documents ownerType="contact" ownerId={c.id} lang={lang} canShare={user.role !== "agent"} />
          <AgreementsPanel t={T2.agr} lang={lang} contactId={c.id} />
        </div>
        <aside>
          <section className="a-panel">
            <h2>{T2.portal.link}</h2>
            <p className="a-muted">{T2.portal.intro}</p>
            <p dir="ltr" className="a-muted" style={{ wordBreak: "break-all" }}>{portal}</p>
            {wa && <a className="a-btn wa small" target="_blank" rel="noreferrer" href={`${wa}?text=${encodeURIComponent(`${c.name}: ${portal}`)}`}>💬 {T2.portal.send}</a>}
          </section>
          <section className="a-panel">
            <h2>{T2.webAccount.title}</h2>
            {webLinked[0] ? (
              <form action={linkWebAccount} className="a-inline">
                <span>{webLinked[0].name} · <span dir="ltr">{webLinked[0].email ?? webLinked[0].phone}</span></span>
                <span className="a-state on">{T2.webAccount.linked} · {T2.webAccount.via[webLinked[0].linkedVia ?? ""] ?? "—"}</span>
                {manager && <><input type="hidden" name="contact" value={c.id} /><input type="hidden" name="account" value={webLinked[0].id} />
                  <button className="a-btn small danger" name="unlink" value="1">{T2.webAccount.unlink}</button></>}
              </form>
            ) : webMatches.length === 0 ? <p className="a-muted">{T2.webAccount.none}</p> : (
              <>
                <p className="a-muted">{T2.webAccount.matches}</p>
                <ul className="a-list">
                  {webMatches.map((a) => (
                    <li key={a.id}>
                      <span>{a.name} · <span dir="ltr">{a.email ?? a.phone}</span></span>
                      {manager && <form action={linkWebAccount}><input type="hidden" name="contact" value={c.id} /><input type="hidden" name="account" value={a.id} />
                        <button className="a-btn small">{T2.webAccount.link}</button></form>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <section className="a-panel">
            <h2>{t.editCustomer}</h2>
            <form action={updateCustomer} className="a-form">
              <input type="hidden" name="id" value={c.id} />
              <label className="a-field"><span>{t.name}</span><input name="name" defaultValue={c.name} required /></label>
              <label className="a-field"><span>{t.phone}</span><input name="phone" defaultValue={c.phone ?? ""} dir="ltr" /></label>
              <label className="a-field"><span>{t.email}</span><input name="email" type="email" defaultValue={c.email ?? ""} dir="ltr" /></label>
              <label className="a-field"><span>{T2.ai.idNumber}</span><input name="idNumber" dir="ltr" maxLength={40} defaultValue={c.idNumber ?? ""} /></label>
              <label className="a-field"><span>{T2.ai.nationality}</span><input name="nationality" dir="auto" maxLength={60} defaultValue={c.nationality ?? ""} /></label>
              <label className="a-field"><span>{T2.ai.idExpiry}</span><input name="idExpiry" type="date" dir="ltr" defaultValue={c.idExpiry ?? ""} /></label>
              {aiOn && <IdScan t={T2.ai} />}
              <label className="a-field"><span>{t.internalNotes}</span><textarea name="notes" rows={3} defaultValue={c.notes} /></label>
              <div><button className="a-btn primary">{t.save}</button></div>
            </form>
          </section>
          <section className="a-panel">
            <h2>{t.consent}</h2>
            {consent.length === 0 ? <p className="a-muted">—</p> : (
              <ul className="a-consents">
                {consent.map((row) => (
                  <li key={row.id}>
                    <span>{t.consentPurposes[row.purpose]} · {row.channel}</span>
                    <span className={`a-state ${row.granted ? "on" : "off"}`}>{row.granted ? t.granted : t.withdrawn}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
