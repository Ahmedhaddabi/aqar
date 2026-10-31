import { and, asc, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { activeStaff } from "@/admin/crm";
import { Documents } from "@/admin/Documents";
import { dateTime, whatsappLink } from "@/admin/format";
import { adminDict, adminLang, fill } from "@/admin/i18n";
import { db } from "@/db";
import { applications, invoices, jobEvents, JOB_STATUSES, users } from "@/db/schema";
import { requireApp } from "@/lib/auth";
import { jobLink } from "@/lib/doc-link";
import { jobWithContact, slaOf } from "@/lib/jobs";

import { addDelivery, addJobNote, moveJob, rateJob, scheduleJob, sendForReview, updateJob } from "../../../job-actions";

const omanInput = (d: Date | null) => (d ? new Date(d.getTime() + 4 * 3_600_000).toISOString().slice(0, 16) : "");

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireApp("erp");
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.jobs;
  const data = await jobWithContact(Number((await params).id));
  if (!data) notFound();
  const { job, contact } = data;
  const [staff, suppliers, events, [invoice]] = await Promise.all([
    activeStaff(),
    db.select({ id: applications.id, name: applications.name, details: applications.details }).from(applications)
      .where(and(eq(applications.kind, "supplier"), inArray(applications.status, ["approved", "active", "verified"]))).orderBy(asc(applications.name)),
    db.select({ e: jobEvents, who: users.name }).from(jobEvents).leftJoin(users, eq(jobEvents.userId, users.id))
      .where(eq(jobEvents.jobId, job.id)).orderBy(desc(jobEvents.createdAt)).limit(100),
    job.invoiceId ? db.select({ id: invoices.id, number: invoices.number }).from(invoices).where(eq(invoices.id, job.invoiceId)) : Promise.resolve([]),
  ]);
  const sla = slaOf(job);
  const link = jobLink(job.id);
  const wa = whatsappLink(contact.phone);
  const office = user.role !== "agent";
  return (
    <>
      <p><Link href="/admin/jobs">← {t.title}</Link></p>
      <header className="a-head a-request-head">
        <div>
          <h1 dir="auto">{job.title}</h1>
          <p className="a-muted"><span dir="ltr">{job.number}</span> · <Link href={`/admin/customers/${contact.id}`}>{contact.name}</Link>
            {invoice && <> · {t.invoice} <Link href={`/admin/invoices/${invoice.id}`} dir="ltr">{invoice.number}</Link></>}</p>
        </div>
        <div className="a-inline">
          <span className={`a-status big ${job.status === "completed" ? "s-won" : job.status === "cancelled" ? "s-closed" : "s-working"}`}>{t.statuses[job.status]}</span>
          {job.dueAt && sla !== "done" && <span className={`sla-${sla}`}>{t.due}: {dateTime(job.dueAt, lang)} · {t.sla[sla]}</span>}
        </div>
      </header>
      <div className="a-two">
        <div>
          <section className="a-panel">
            <h2>{t.markStatus}</h2>
            <div className="a-status-row">
              {JOB_STATUSES.map((s) => (
                <form key={s} action={moveJob}><input type="hidden" name="id" value={job.id} /><input type="hidden" name="status" value={s} />
                  <button className={`a-btn small${s === job.status ? " current" : ""}`} disabled={s === job.status}>{t.statuses[s]}</button></form>
              ))}
            </div>
            <form action={scheduleJob} className="a-inline" style={{ marginTop: 12 }}>
              <input type="hidden" name="id" value={job.id} />
              <label className="a-inline">{t.schedule} <input type="datetime-local" name="scheduledAt" defaultValue={omanInput(job.scheduledAt)} required /></label>
              <button className="a-btn small">{t.scheduleSave}</button>
            </form>
          </section>
          <section className="a-panel">
            <h2>{t.brief}</h2>
            {job.brief ? (
              <dl className="a-facts">{Object.entries(job.brief).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} style={k === "notes" ? { gridColumn: "1 / -1" } : undefined}><dt>{k}</dt><dd className="a-quote" dir="auto">{v}</dd></div>))}</dl>
            ) : <p className="a-muted">{t.briefMissing}</p>}
          </section>
          <section className="a-panel">
            <h2>{t.deliver}</h2>
            {job.deliverables.length > 0 && (
              <ul className="a-list">{job.deliverables.map((d, i) => (
                <li key={i}><a href={d.url} target="_blank" rel="noreferrer"><strong dir="auto">{d.label}</strong> ↗</a>
                  <span className="a-muted">{dateTime(d.at, lang)}</span></li>))}</ul>
            )}
            <form action={addDelivery} className="a-inline" style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={job.id} />
              <input name="label" placeholder={t.deliveryLabel} aria-label={t.deliveryLabel} required dir="auto" />
              <input name="url" type="url" placeholder={t.deliveryUrl} aria-label={t.deliveryUrl} required dir="ltr" pattern="https://.*" />
              <button className="a-btn small">+ {t.deliver}</button>
            </form>
            <p className="a-muted" style={{ marginTop: 10 }}>{fill(t.revisions, { used: job.revisionsUsed, allowed: job.revisionsAllowed })}</p>
            {job.deliverables.length > 0 && job.status !== "completed" && (
              <form action={sendForReview}><input type="hidden" name="id" value={job.id} /><button className="a-btn primary">{t.sendForReview}</button></form>
            )}
          </section>
          <Documents ownerType="job" ownerId={job.id} lang={lang} canShare />
          <section className="a-panel">
            <h2>{t.timeline}</h2>
            <form action={addJobNote} className="a-inline"><input type="hidden" name="id" value={job.id} />
              <input name="body" placeholder={t.addNote} aria-label={t.addNote} required dir="auto" style={{ flex: 1 }} />
              <button className="a-btn small">{t.addNote}</button></form>
            <ul className="a-timeline">
              {events.map(({ e, who }) => (
                <li key={e.id} className={`t-${e.kind === "note" ? "call" : "system"}`}>
                  <div className="a-timeline-head"><strong>{t.events[e.kind]}</strong><span className="a-muted">{who ?? contact.name} · {dateTime(e.createdAt, lang)}</span></div>
                  {e.body && <p dir="auto">{e.kind === "status" ? (t.statuses[e.body] ?? e.body) : e.body}</p>}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside>
          <section className="a-panel">
            <h2>{t.customerLink}</h2>
            <p dir="ltr" className="a-muted" style={{ wordBreak: "break-all" }}>{link}</p>
            {wa && <a className="a-btn wa small" target="_blank" rel="noreferrer"
              href={`${wa}?text=${encodeURIComponent(`${contact.name}: ${job.title} — ${link}`)}`}>💬 WhatsApp</a>}
          </section>
          {office && job.price != null && (
            <section className="a-panel">
              <h2>{T.rating.margin}</h2>
              <dl className="a-facts">
                <div><dt>{T.rating.price}</dt><dd>{job.price.toFixed(3)}</dd></div>
                <div><dt>{T.rating.cost}</dt><dd>{(job.supplierCost ?? 0).toFixed(3)}</dd></div>
                <div><dt>{T.rating.margin}</dt><dd className={job.price - (job.supplierCost ?? 0) < 0 ? "a-error" : ""}>
                  {(job.price - (job.supplierCost ?? 0)).toFixed(3)} OMR ({job.price ? Math.round(((job.price - (job.supplierCost ?? 0)) / job.price) * 100) : 0}%)</dd></div>
              </dl>
            </section>
          )}
          {office && job.supplierId && job.status === "completed" && (
            <section className="a-panel">
              <h2>⭐ {T.rating.title}</h2>
              <form action={rateJob} className="a-form">
                <input type="hidden" name="id" value={job.id} />
                <div className="a-stars" role="radiogroup" aria-label={T.rating.stars}>
                  {[1, 2, 3, 4, 5].map((n) => <label key={n}><input type="radio" name="rating" value={n} defaultChecked={job.rating === n} required /> {n}★</label>)}
                </div>
                <label className="a-field"><span>{T.rating.note}</span><input name="ratingNote" defaultValue={job.ratingNote ?? ""} dir="auto" /></label>
                <div><button className="a-btn">{T.rating.save}</button></div>
              </form>
            </section>
          )}
          {office && (
            <section className="a-panel">
              <form action={updateJob} className="a-form">
                <input type="hidden" name="id" value={job.id} />
                <label className="a-field"><span>{t.assign}</span>
                  <select name="assignedTo" defaultValue={job.assignedTo ?? ""}><option value="">—</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <label className="a-field"><span>{t.supplier}</span>
                  <select name="supplierId" defaultValue={job.supplierId ?? ""}><option value="">—</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{(s.details as Record<string, string>).company ? ` · ${(s.details as Record<string, string>).company}` : ""}</option>)}</select></label>
                <label className="a-field"><span>{t.supplierCost}</span><input type="number" name="supplierCost" min={0} step="0.001" defaultValue={job.supplierCost ?? ""} /></label>
                <label className="a-field"><span>{t.notes}</span><textarea name="notes" rows={3} defaultValue={job.notes} dir="auto" /></label>
                <div><button className="a-btn">{T.hr.save}</button></div>
              </form>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
