import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { dateOnly } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { AGREEMENT_STATUSES, agreements, contacts } from "@/db/schema";
import { requireApp } from "@/lib/auth";

/** Every agreement, newest first, filtered by status. New ones start from a customer or request page. */
export default async function AgreementsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const t = adminDict(lang).agr;
  const status = (await searchParams).status;
  const filter = AGREEMENT_STATUSES.find((s) => s === status);
  const rows = await db.select({ a: agreements, c: contacts }).from(agreements).innerJoin(contacts, eq(agreements.contactId, contacts.id))
    .where(filter ? eq(agreements.status, filter) : undefined).orderBy(desc(agreements.createdAt)).limit(300);
  return (
    <>
      <header className="a-head"><h1>✍️ {t.title}</h1><p className="a-muted">{t.intro}</p></header>
      <nav className="a-tabs a-toolbar">
        <Link href="/admin/agreements" aria-current={!filter ? "page" : undefined}>{t.all}</Link>
        {AGREEMENT_STATUSES.map((s) => <Link key={s} href={`/admin/agreements?status=${s}`} aria-current={filter === s ? "page" : undefined}>{t.statuses[s]}</Link>)}
      </nav>
      <section className="a-panel">
        {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <table className="a-table">
            <thead><tr><th>{t.number}</th><th>{t.customer}</th><th>{t.status}</th><th>{t.date}</th></tr></thead>
            <tbody>{rows.map(({ a, c }) => (
              <tr key={a.id}>
                <td data-label={t.number}><Link href={`/admin/agreements/${a.id}`}><strong dir="ltr">{a.number}</strong></Link><div dir="auto">{a.title}</div></td>
                <td data-label={t.customer}><Link href={`/admin/customers/${c.id}`}>{c.name}</Link></td>
                <td data-label={t.status}><span className={`a-state ${a.status === "signed" ? "on" : a.status === "declined" || a.status === "cancelled" ? "bad" : "off"}`}>{t.statuses[a.status]}</span></td>
                <td data-label={t.date}>{dateOnly(a.signedAt ?? a.sentAt ?? a.createdAt, lang)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
