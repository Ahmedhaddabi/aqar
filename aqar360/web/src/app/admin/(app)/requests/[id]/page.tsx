import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AgreementsPanel } from "@/admin/AgreementsPanel";
import { activeStaff, getRequest } from "@/admin/crm";
import { matchesFor, offersFor } from "@/admin/deals";
import { Offers, Suggestions } from "@/admin/DealPanels";
import { dateOnly, dateTime, detailRows, money, siteDict, whatsappLink } from "@/admin/format";
import { adminDict, adminLang, fill } from "@/admin/i18n";
import { Documents } from "@/admin/Documents";
import { Timeline } from "@/admin/Timeline";
import { db } from "@/db";
import { contacts, REQUEST_STATUSES } from "@/db/schema";
import { optionLabel } from "@/i18n/dictionaries";
import { canOpen, requireApp } from "@/lib/auth";
import { siteUrl } from "@/lib/config";
import { savedByContact } from "@/lib/viewings";

import { assignRequest, changeStatus } from "../../../crm-actions";
import { acceptOpportunity, declineOpportunity } from "../../../review-actions";

export default async function RequestPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ accepted?: string; declined?: string; existing?: string }>;
}) {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.crm;
  const site = siteDict(lang);
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await getRequest(user, id) : null;
  if (!data) notFound();
  const { request: r, contact: c, owner, areas, project, property, timeline } = data;
  const [referrer] = r.referredBy ? await db.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, r.referredBy)) : [];
  const [staff, matchRows, offerRows] = await Promise.all([user.role === "agent" ? Promise.resolve([]) : activeStaff(),
    r.kind === "search" ? matchesFor(r.id) : Promise.resolve([]), offersFor(r.id)]);
  const offerChoices = matchRows.filter((m) => m.property && ["approved", "sent"].includes(m.match.status))
    .map((m) => ({ id: m.property!.id, label: `${m.property!.kind} ${m.property!.unitNumber ?? m.property!.code}` }));
  const wa = whatsappLink(c.phone);
  const facts = [
    [t.type, r.propertyType ? optionLabel(site, r.propertyType) : null],
    [t.budget, r.budgetMin && r.budgetMax ? `${money(r.budgetMin, lang)} – ${money(r.budgetMax, lang)}` : money(r.budgetMax, lang)],
    [t.areas, areas.map((a) => (lang === "ar" ? a.nameAr : a.nameEn)).join("، ")],
    [site.form.bedrooms, r.bedroomsMin ? String(r.bedroomsMin) : null],
    [t.timing, r.timing ? optionLabel(site, r.timing) : null],
    [site.form.preferredChannel, r.preferredChannel ? optionLabel(site, r.preferredChannel) : null],
    ...detailRows(r.details, lang, t.yes, t.no).map((d) => [d.label, d.value] as const),
    [t.expires, r.expiresOn ? dateOnly(r.expiresOn, lang) : null],
    [t.source, [r.sourceChannel, r.sourcePage].filter(Boolean).join(" · ")],
    [T.reviewsAdmin.referredBy, referrer?.name ?? null],
  ].filter(([, v]) => v) as [string, string][];
  const review = (r.details as { review?: { decision: string; mode?: string; propertyId?: number; reason?: string } }).review;
  const flash = await searchParams;
  const V = T.review;
  const interestName = project ? (lang === "ar" ? project.nameAr || project.nameEn : project.nameEn) : property?.title || property?.code;
  return (
    <>
      <p><Link href="/admin/requests">← {t.backToInbox}</Link></p>
      <header className="a-head a-request-head">
        <div>
          <h1>{c.name} <span className="a-muted a-number">{r.number}</span></h1>
          <p className="a-muted">{t.kinds[r.kind]}{r.subtype ? ` · ${optionLabel(site, r.subtype)}` : ""} · {dateTime(r.createdAt, lang)}</p>
        </div>
        <span className={`a-status big s-${r.status}`}>{t.statuses[r.status]}</span>
        {canOpen(user, "erp") && (user.role === "admin" || user.role === "manager") && (
          <div className="a-actions">
            <Link className="a-btn small" href={`/admin/invoices/new?kind=quote&contact=${c.id}&request=${r.id}`}>+ {T.money.newQuote}</Link>
            <Link className="a-btn small" href={`/admin/invoices/new?kind=invoice&contact=${c.id}&request=${r.id}`}>+ {T.money.newInvoice}</Link>
          </div>
        )}
      </header>

      {flash.existing && <p className="a-ok">{fill(T.entry.existing, { name: c.name })}</p>}
      <div className="a-two">
        <div>
          <section className="a-panel">
            <h2>{t.status}</h2>
            <p className="a-muted">{t.statusHelp}</p>
            <div className="a-status-row">
              {REQUEST_STATUSES.filter((s) => s !== "closed").map((s) => (
                <form key={s} action={changeStatus}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value={s} />
                  <button className={`a-btn small${s === r.status ? " current" : ""}`} disabled={s === r.status}>{t.statuses[s]}</button>
                </form>
              ))}
            </div>
            {r.status !== "closed" && (
              <form action={changeStatus} className="a-inline a-close">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="status" value="closed" />
                <input name="reason" placeholder={t.closeReason} aria-label={t.closeReason} />
                <button className="a-btn small danger">{t.statuses.closed}</button>
              </form>
            )}
            {r.closedReason && <p className="a-muted">{t.closeReason}: {r.closedReason}</p>}
          </section>

          <section className="a-panel">
            <h2>{t.details}</h2>
            {(project || property) && (
              <p className="a-interest">⭐ {t.interest}: <strong>{interestName}</strong>
                {property?.unitNumber ? ` · ${property.unitNumber}` : ""}
                {project && <> · <a href={`/${lang}/projects/${project.slug}`} target="_blank" rel="noreferrer">↗</a></>}</p>
            )}
            {r.alertsPaused && <p className="a-tag">{t.alertsPaused}</p>}
            <dl className="a-facts">
              {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
            {r.notes && <><h3>{t.notes}</h3><p className="a-quote">{r.notes}</p></>}
          </section>

          {r.kind === "listing" && (
            <section className="a-panel a-review">
              <h2>🔍 {V.title}</h2>
              {flash.accepted && <p className="a-ok">{V.accepted}</p>}
              {flash.declined && <p className="a-ok">{V.declined}</p>}
              {review ? (
                <p>{review.decision === "accepted" ? (review.mode === "content" ? V.acceptContent : V.acceptMarket) : `${V.notSelected} · ${V.reasons[review.reason ?? "other"]}`}
                  {review.propertyId && <> · <Link href={`/admin/properties/${review.propertyId}`}>{V.openProperty}</Link></>}</p>
              ) : r.status !== "closed" && (
                <>
                  <p className="a-muted">{V.intro}</p>
                  {user.role !== "agent" && (
                    <div className="a-inline">
                      <form action={acceptOpportunity}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="mode" value="market" />
                        <button className="a-btn primary">✓ {V.acceptMarket}</button></form>
                      <form action={acceptOpportunity}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="mode" value="content" />
                        <button className="a-btn">✓ {V.acceptContent}</button></form>
                    </div>
                  )}
                  <form action={declineOpportunity} className="a-inline" style={{ marginTop: 10 }}>
                    <input type="hidden" name="id" value={r.id} />
                    <select name="reason" aria-label={V.reason}>{Object.entries(V.reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    <label className="a-check"><input type="checkbox" name="send" defaultChecked /> {V.send}</label>
                    <button className="a-btn danger">{V.notSelected}</button>
                  </form>
                </>
              )}
            </section>
          )}
          {r.kind === "search" && <Suggestions rows={matchRows} t={T.match} lang={lang} requestId={r.id}
            customer={{ name: c.name, phone: c.phone, number: r.number, siteUrl }} saved={await savedByContact(c.id)} />}
          {r.kind !== "consulting" && <Offers rows={offerRows} t={T.match} lang={lang} requestId={r.id} choices={offerChoices} />}
          <Timeline rows={timeline} t={t} lang={lang} contactId={c.id} requestId={r.id} results={T.match} />
          <Documents ownerType="request" ownerId={r.id} lang={lang} canShare={user.role !== "agent"} />
          <AgreementsPanel t={T.agr} lang={lang} contactId={c.id} requestId={r.id} />
        </div>

        <aside>
          <section className="a-panel">
            <h2>{t.customerCard}</h2>
            <p><strong>{c.name}</strong></p>
            {c.phone && <p dir="ltr" className="a-phone">{c.phone}</p>}
            {c.email && <p dir="ltr" className="a-muted">{c.email}</p>}
            <div className="a-contact-buttons">
              {c.phone && <a className="a-btn primary" href={`tel:${c.phone}`}>📞 {t.call}</a>}
              {wa && <a className="a-btn wa" href={wa} target="_blank" rel="noreferrer">💬 {t.whatsapp}</a>}
              {c.email && <a className="a-btn" href={`mailto:${c.email}`}>✉ {t.email}</a>}
            </div>
            <p><Link href={`/admin/customers/${c.id}`}>{t.openCustomer}</Link></p>
            {user.role !== "agent" && (
              <div className="a-inline">
                <Link className="a-btn small" href={`/admin/invoices/new?kind=quote&contact=${c.id}&request=${r.id}`}>+ {T.money.newQuote}</Link>
                <Link className="a-btn small" href={`/admin/invoices/new?kind=invoice&contact=${c.id}&request=${r.id}`}>+ {T.money.newInvoice}</Link>
              </div>
            )}
          </section>
          <section className="a-panel">
            <h2>{t.owner}</h2>
            <p>{owner?.name ?? <span className="a-muted">{t.unassigned}</span>}</p>
            {!r.assignedTo && (
              <form action={assignRequest}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="to" value="me" />
                <button className="a-btn primary">{t.takeIt}</button>
              </form>
            )}
            {staff.length > 0 && (
              <form action={assignRequest} className="a-inline">
                <input type="hidden" name="id" value={r.id} />
                <select name="to" defaultValue={r.assignedTo ?? ""} aria-label={t.assignTo}>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button className="a-btn small">{t.assign}</button>
              </form>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
