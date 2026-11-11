import Link from "next/link";

import { listCustomers } from "@/admin/crm";
import { ago } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { requireApp } from "@/lib/auth";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const t = adminDict(lang).crm;
  const { q } = await searchParams;
  const rows = await listCustomers(user, q);
  return (
    <>
      <header className="a-head">
        <h1>{t.customers}</h1>
        <p className="a-muted">{t.customersIntro}</p>
      </header>
      <form className="a-inline a-toolbar" action="/admin/customers">
        <input name="q" defaultValue={q} placeholder={t.search} aria-label={t.search} />
        <button className="a-btn">{t.searchBtn}</button>
      </form>
      <section className="a-panel">
        {rows.length === 0 ? (q?.trim()
          ? <p className="a-muted">{t.noMatch.replace("{q}", q.trim())} <Link href="/admin/customers">{t.clearSearch}</Link></p>
          : <p className="a-muted">{t.none} <Link className="a-btn small primary" href="/admin/requests/new">+ {adminDict(lang).nav.newEntry}</Link></p>) : (
          <table className="a-table">
            <thead><tr><th>{t.name}</th><th>{t.phone}</th><th>{t.requestsCount}</th><th>{t.received}</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td data-label={t.name}>
                    <Link href={`/admin/customers/${c.id}`} className="a-row-link"><strong>{c.name}</strong></Link>
                    {c.email && <div className="a-muted" dir="ltr">{c.email}</div>}
                  </td>
                  <td data-label={t.phone} dir="ltr">{c.phone}</td>
                  <td data-label={t.requestsCount}>{c.requests}</td>
                  <td data-label={t.received}>{c.lastRequest ? ago(c.lastRequest, lang) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
