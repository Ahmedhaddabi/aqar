import { asc, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { dateTime } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { contacts, type JobStatus, serviceJobs, users } from "@/db/schema";
import { requireApp } from "@/lib/auth";
import { OPEN_JOB, slaOf } from "@/lib/jobs";

const TABS: Record<string, JobStatus[] | null> = { open: [...OPEN_JOB], waiting: ["waiting_client", "review"], done: ["completed", "cancelled"], all: null };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireApp("erp");
  const lang = await adminLang(user.language);
  const t = adminDict(lang).jobs;
  const raw = (await searchParams).tab ?? "open";
  const tab = raw in TABS ? raw : "open";
  const filter = TABS[tab];
  const rows = await db.select({ job: serviceJobs, customer: contacts.name, owner: users.name }).from(serviceJobs)
    .innerJoin(contacts, eq(serviceJobs.contactId, contacts.id)).leftJoin(users, eq(serviceJobs.assignedTo, users.id))
    .where(filter ? inArray(serviceJobs.status, filter) : undefined)
    .orderBy(tab === "done" ? desc(serviceJobs.updatedAt) : asc(serviceJobs.dueAt)).limit(300);
  return (
    <>
      <header className="a-head"><h1>{t.title}</h1><p className="a-muted">{t.intro}</p></header>
      <nav className="a-tabs a-toolbar">
        {Object.keys(TABS).map((k) => <Link key={k} href={`/admin/jobs?tab=${k}`} aria-current={k === tab ? "page" : undefined}>{t.tabs[k]}</Link>)}
      </nav>
      <section className="a-panel">
        {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <table className="a-table">
            <thead><tr><th>{t.number}</th><th>{t.customer}</th><th>{t.owner}</th><th>{t.due}</th><th>{t.status}</th></tr></thead>
            <tbody>
              {rows.map(({ job, customer, owner }) => {
                const sla = slaOf(job);
                return (
                  <tr key={job.id} className={sla === "red" || sla === "amber" ? `sla-row-${sla}` : ""}>
                    <td data-label={t.number}><Link className="a-row-link" href={`/admin/jobs/${job.id}`}><strong dir="ltr">{job.number}</strong></Link>
                      <div className="a-muted" dir="auto">{job.title}</div></td>
                    <td data-label={t.customer}>{customer}</td>
                    <td data-label={t.owner}>{owner ?? "—"}</td>
                    <td data-label={t.due}>{job.dueAt && sla !== "done" ? <span className={`sla-${sla}`}>{dateTime(job.dueAt, lang)} · {t.sla[sla]}</span> : "—"}</td>
                    <td data-label={t.status}><span className={`a-status ${job.status === "completed" ? "s-won" : job.status === "cancelled" ? "s-closed" : "s-working"}`}>
                      {t.statuses[job.status]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
