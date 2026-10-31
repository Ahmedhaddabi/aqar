import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { dateTime, whatsappLink } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { applications, JOB_STAGES, jobs, serviceJobs, SUPPLIER_STAGES } from "@/db/schema";
import { requireApp } from "@/lib/auth";

import { updateApplication } from "../../../hiring-actions";


export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireApp("hr", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.hiring;
  const appId = Number((await params).id);
  const [row] = Number.isInteger(appId) ? await db.select({ app: applications, job: jobs }).from(applications)
    .leftJoin(jobs, eq(applications.jobId, jobs.id)).where(eq(applications.id, appId)) : [];
  if (!row) notFound();
  const { app, job } = row;
  const d = app.details as Record<string, string>;
  const work = app.kind === "supplier" ? await db.select({ rating: serviceJobs.rating, cost: serviceJobs.supplierCost, status: serviceJobs.status })
    .from(serviceJobs).where(eq(serviceJobs.supplierId, app.id)) : [];
  const rated = work.filter((w) => w.rating);
  const avg = rated.length ? rated.reduce((a, w) => a + (w.rating ?? 0), 0) / rated.length : null;
  const wa = whatsappLink(app.phone);
  const shown = (["company", "cr_number", "services", "areas", "experience", "message"] as const).filter((k) => d[k]);
  const labels: Record<string, string> = { ...t.fields, cr_number: t.fields.crNumber };
  return (
    <>
      <p><Link href={`/admin/hiring?tab=${app.kind}`}>← {t.tabs[app.kind]}</Link></p>
      <header className="a-head">
        <h1>{app.name}</h1>
        <p className="a-muted">{app.kind === "job" ? (job ? (lang === "ar" ? job.titleAr || job.titleEn : job.titleEn) : T.site.noArea) : t.tabs.supplier}
          {" · "}{dateTime(app.createdAt, lang)}</p>
        <div className="a-contact-buttons">
          {app.phone && <a className="a-btn primary" href={`tel:${app.phone}`} dir="ltr">📞 {app.phone}</a>}
          {wa && <a className="a-btn wa" href={wa} target="_blank" rel="noreferrer">💬 {T.crm.whatsapp}</a>}
          {app.email && <a className="a-btn" href={`mailto:${app.email}`}>✉ {app.email}</a>}
          {app.fileUrl && <a className="a-btn" href={app.fileUrl} target="_blank" rel="noreferrer">📄 {t.openFile}</a>}
        </div>
      </header>
      <div className="a-two">
        <section className="a-panel">
          <h2>{t.details}</h2>
          {shown.length === 0 ? <p className="a-muted">—</p> : (
            <dl className="a-facts">
              {shown.map((k) => <div key={k} style={k === "message" || k === "services" ? { gridColumn: "1 / -1" } : undefined}>
                <dt>{labels[k]}</dt><dd className="a-quote" dir="auto">{d[k]}</dd></div>)}
            </dl>
          )}
        </section>
        <aside>
          {app.kind === "supplier" && (
            <section className="a-panel">
              <h2>⭐ {T.rating.scorecard}</h2>
              <dl className="a-facts">
                <div><dt>{T.rating.jobs}</dt><dd>{work.filter((w) => w.status === "completed").length} / {work.length}</dd></div>
                <div><dt>{T.rating.avg}</dt><dd>{avg ? `${avg.toFixed(1)} ★ (${rated.length})` : "—"}</dd></div>
                <div><dt>{T.rating.cost}</dt><dd>{work.reduce((a, w) => a + (w.cost ?? 0), 0).toFixed(3)} OMR</dd></div>
              </dl>
            </section>
          )}
          <section className="a-panel">
            <h2>{t.status}</h2>
            <div className="a-status-row">
              {(app.kind === "job" ? JOB_STAGES : SUPPLIER_STAGES).map((s) => (
                <form key={s} action={updateApplication}>
                  <input type="hidden" name="id" value={app.id} /><input type="hidden" name="status" value={s} />
                  <button className={`a-btn small${s === app.status ? " current" : ""}`} disabled={s === app.status}>{t.statuses[s]}</button>
                </form>
              ))}
            </div>
            <form action={updateApplication} className="a-form">
              <input type="hidden" name="id" value={app.id} />
              <label className="a-field"><span>{t.notes}</span><textarea name="notes" rows={4} defaultValue={app.notes} dir="auto" /></label>
              <div><button className="a-btn">{t.save}</button></div>
            </form>
          </section>
        </aside>
      </div>
    </>
  );
}
