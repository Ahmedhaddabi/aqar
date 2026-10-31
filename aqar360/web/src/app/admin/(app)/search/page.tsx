import { and, desc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";

import { visibleTo } from "@/admin/crm";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { contacts, invoices, properties, requests, serviceJobs } from "@/db/schema";
import { canOpen, requireUser } from "@/lib/auth";

/** One box for everything: customers, requests, properties, invoices and jobs, limited to what the person may see. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.search;
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const like = `%${q}%`;
  const digits = q.replace(/[^\d]/g, "");
  const office = user.role !== "agent";
  const crm = canOpen(user, "crm");
  const erp = canOpen(user, "erp") && office;
  const [reqs, people, props, invs, jobs] = q.length < 2 ? [[], [], [], [], []] : await Promise.all([
    crm ? db.select({ id: requests.id, number: requests.number, kind: requests.kind, status: requests.status, name: contacts.name }).from(requests)
      .innerJoin(contacts, eq(requests.contactId, contacts.id))
      .where(and(visibleTo(user), or(ilike(requests.number, like), ilike(contacts.name, like), ilike(contacts.email, like),
        ...(digits.length >= 4 ? [ilike(contacts.phone, `%${digits}%`)] : []))))
      .orderBy(desc(requests.createdAt)).limit(15) : Promise.resolve([]),
    crm && office ? db.select().from(contacts).where(or(ilike(contacts.name, like), ilike(contacts.email, like),
      ...(digits.length >= 4 ? [ilike(contacts.phone, `%${digits}%`)] : []))).orderBy(desc(contacts.createdAt)).limit(15) : Promise.resolve([]),
    crm && office ? db.select().from(properties).where(or(ilike(properties.code, like), ilike(properties.title, like), ilike(properties.unitNumber, like)))
      .limit(15) : Promise.resolve([]),
    erp ? db.select({ inv: invoices, name: contacts.name }).from(invoices).innerJoin(contacts, eq(invoices.contactId, contacts.id))
      .where(or(ilike(invoices.number, like), ilike(contacts.name, like))).orderBy(desc(invoices.createdAt)).limit(15) : Promise.resolve([]),
    erp ? db.select({ job: serviceJobs, name: contacts.name }).from(serviceJobs).innerJoin(contacts, eq(serviceJobs.contactId, contacts.id))
      .where(or(ilike(serviceJobs.number, like), ilike(serviceJobs.title, like), ilike(contacts.name, like))).orderBy(desc(serviceJobs.createdAt)).limit(15)
      : Promise.resolve([]),
  ]);
  const groups: [string, { href: string; main: string; sub: string }[]][] = [
    [t.groups.customers, people.map((c) => ({ href: `/admin/customers/${c.id}`, main: c.name, sub: [c.phone, c.email].filter(Boolean).join(" · ") }))],
    [t.groups.requests, reqs.map((r) => ({ href: `/admin/requests/${r.id}`, main: `${r.number} · ${r.name}`, sub: `${T.crm.kinds[r.kind]} · ${T.crm.statuses[r.status]}` }))],
    [t.groups.properties, props.map((p) => ({ href: `/admin/properties/${p.id}`, main: `${p.code}${p.unitNumber ? ` · ${p.unitNumber}` : ""}`, sub: p.title || p.kind }))],
    [t.groups.invoices, invs.map(({ inv, name }) => ({ href: `/admin/invoices/${inv.id}`, main: `${inv.number} · ${name}`, sub: `${inv.total.toFixed(3)} OMR · ${T.money.statuses[inv.status]}` }))],
    [t.groups.jobs, jobs.map(({ job, name }) => ({ href: `/admin/jobs/${job.id}`, main: `${job.number} · ${job.title}`, sub: `${name} · ${T.jobs.statuses[job.status]}` }))],
  ];
  const found = groups.some(([, rows]) => rows.length);
  return (
    <>
      <header className="a-head"><h1>{t.title}</h1></header>
      <form action="/admin/search" className="a-inline a-toolbar">
        <input name="q" defaultValue={q} placeholder={t.placeholder} aria-label={t.title} style={{ flex: 1, minWidth: 260 }} autoFocus />
        <button className="a-btn primary">🔍</button>
      </form>
      {q.length >= 2 && !found && <p className="a-muted">{t.none}</p>}
      <div className="a-two-lang">
        {groups.filter(([, rows]) => rows.length).map(([title, rows]) => (
          <section key={title} className="a-panel">
            <h2>{title}</h2>
            <ul className="a-list">{rows.map((r) => <li key={r.href}><Link href={r.href}><strong dir="auto">{r.main}</strong></Link>
              <span className="a-muted" dir="auto">{r.sub}</span></li>)}</ul>
          </section>
        ))}
      </div>
    </>
  );
}
