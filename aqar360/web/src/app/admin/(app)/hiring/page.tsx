import { count, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { ago, dateOnly } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { applications, jobs } from "@/db/schema";
import { requireApp } from "@/lib/auth";

const TABS = ["job", "supplier", "posts"] as const;
type Tab = (typeof TABS)[number];
const STATUS_TONE: Record<string, string> = { new: "s-new", reviewing: "s-working", shortlisted: "s-viewing", approved: "s-won", rejected: "s-closed",
  screening: "s-working", interview: "s-viewing", offer: "s-offer", hired: "s-won", verified: "s-working", active: "s-won", suspended: "s-closed" };

export default async function HiringPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireApp("hr", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).hiring;
  const raw = (await searchParams).tab;
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "job";
  return (
    <>
      <header className="a-head a-request-head">
        <div><h1>{t.title}</h1><p className="a-muted">{t.intro}</p></div>
        {tab === "posts" && <Link className="a-btn primary" href="/admin/hiring/jobs/new">+ {t.addPost}</Link>}
      </header>
      <nav className="a-tabs a-toolbar">
        {TABS.map((k) => <Link key={k} href={`/admin/hiring?tab=${k}`} aria-current={k === tab ? "page" : undefined}>{t.tabs[k]}</Link>)}
      </nav>
      {tab === "posts" ? <Posts lang={lang} t={t} /> : <Applications kind={tab} lang={lang} t={t} />}
    </>
  );
}

type T = ReturnType<typeof adminDict>["hiring"];

async function Applications({ kind, lang, t }: { kind: "job" | "supplier"; lang: "ar" | "en"; t: T }) {
  const rows = await db.select({ app: applications, job: jobs.titleEn, jobAr: jobs.titleAr }).from(applications)
    .leftJoin(jobs, eq(applications.jobId, jobs.id)).where(eq(applications.kind, kind)).orderBy(desc(applications.createdAt)).limit(300);
  if (!rows.length) return <section className="a-panel"><p className="a-muted">{t.none}</p></section>;
  return (
    <section className="a-panel">
      <table className="a-table">
        <thead><tr><th>{t.name}</th><th>{kind === "job" ? t.job : t.fields.services}</th><th>{t.received}</th><th>{t.status}</th></tr></thead>
        <tbody>
          {rows.map(({ app, job, jobAr }) => {
            const d = app.details as Record<string, string>;
            return (
              <tr key={app.id}>
                <td data-label={t.name}><Link className="a-row-link" href={`/admin/hiring/${app.id}`}><strong>{app.name}</strong></Link>
                  {d.company && <div className="a-muted">{d.company}</div>}</td>
                <td data-label={kind === "job" ? t.job : t.fields.services}>
                  {kind === "job" ? ((lang === "ar" ? jobAr || job : job) ?? "—") : (d.services ?? "").slice(0, 80)}</td>
                <td data-label={t.received}>{ago(app.createdAt, lang)}</td>
                <td><span className={`a-status ${STATUS_TONE[app.status]}`}>{t.statuses[app.status]}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

async function Posts({ lang, t }: { lang: "ar" | "en"; t: T }) {
  const rows = await db.select({ job: jobs, applicants: count(applications.id) }).from(jobs)
    .leftJoin(applications, eq(applications.jobId, jobs.id)).groupBy(jobs.id).orderBy(desc(jobs.createdAt));
  if (!rows.length) return <section className="a-panel"><p className="a-muted">{t.none}</p></section>;
  return (
    <section className="a-panel">
      <table className="a-table">
        <thead><tr><th>{t.titleEn}</th><th>{t.closesOn}</th><th>{t.applicants}</th><th>{t.status}</th></tr></thead>
        <tbody>
          {rows.map(({ job, applicants }) => (
            <tr key={job.id}>
              <td data-label={t.titleEn}><Link className="a-row-link" href={`/admin/hiring/jobs/${job.id}`}>
                <strong>{lang === "ar" ? job.titleAr || job.titleEn : job.titleEn}</strong></Link>
                <div className="a-muted">{job.location} · {job.employmentType}</div></td>
              <td data-label={t.closesOn}>{job.closesOn ? dateOnly(job.closesOn, lang) : "—"}</td>
              <td data-label={t.applicants}>{applicants}</td>
              <td><span className={`a-state ${job.published ? "on" : "off"}`}>{job.published ? t.live : t.hidden}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
