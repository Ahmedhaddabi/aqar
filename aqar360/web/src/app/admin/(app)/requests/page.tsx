import Link from "next/link";

import { firstResponseHours, type InboxTab, listRequests } from "@/admin/crm";
import { ago, money, siteDict } from "@/admin/format";
import { adminDict, adminLang, fill } from "@/admin/i18n";
import { optionLabel } from "@/i18n/dictionaries";
import { REQUEST_KINDS, type RequestKind } from "@/db/schema";
import { requireApp } from "@/lib/auth";

const TABS: InboxTab[] = ["new", "mine", "open", "closed"];

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; kind?: string }> }) {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const t = adminDict(lang).crm;
  const site = siteDict(lang);
  const { tab: rawTab, q, kind: rawKind } = await searchParams;
  // Separate pipelines per request type (strategy §8.1): searchers, owners, consulting.
  const kind = (REQUEST_KINDS as readonly string[]).includes(rawKind ?? "") ? (rawKind as RequestKind) : undefined;
  const tab = (TABS as string[]).includes(rawTab ?? "") ? (rawTab as InboxTab) : "new";
  const [rows, hours] = await Promise.all([listRequests(user, tab, q, kind), firstResponseHours()]);
  const overdueMs = hours * 3_600_000;
  return (
    <>
      <header className="a-head">
        <h1>{t.inbox}</h1>
        <p className="a-muted">{t.inboxIntro}</p>
      </header>
      <div className="a-toolbar">
        <nav className="a-tabs" aria-label={t.inbox}>
          {TABS.map((key) => (
            <Link key={key} href={`/admin/requests?tab=${key}${kind ? `&kind=${kind}` : ""}`} aria-current={key === tab ? "page" : undefined}>{t.tabs[key]}</Link>
          ))}
        </nav>
        <form className="a-inline" action="/admin/requests">
          <input type="hidden" name="tab" value={tab} />
          <select name="kind" defaultValue={kind ?? ""} aria-label={t.what}>
            <option value="">{t.what}: {lang === "ar" ? "الكل" : "All"}</option>
            {REQUEST_KINDS.map((k) => <option key={k} value={k}>{t.kinds[k]}</option>)}
          </select>
          <input name="q" defaultValue={q} placeholder={t.search} aria-label={t.search} />
          <button className="a-btn">{t.searchBtn}</button>
        </form>
      </div>
      <section className="a-panel">
        {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <table className="a-table">
            <thead>
              <tr><th>{t.customer}</th><th>{t.what}</th><th>{t.status}</th><th>{t.owner}</th><th>{t.received}</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const late = r.status === "new" && !r.firstResponseAt && Date.now() - new Date(r.createdAt).getTime() > overdueMs;
                return (
                  <tr key={r.id} className={late ? "late" : ""}>
                    <td data-label={t.customer}>
                      <Link href={`/admin/requests/${r.id}`} className="a-row-link"><strong>{r.customer}</strong></Link>
                      <div className="a-muted"><span dir="ltr">{r.phone}</span> · {r.number}</div>
                    </td>
                    <td data-label={t.what}>
                      {t.kinds[r.kind]}
                      <div className="a-muted">{[r.subtype && optionLabel(site, r.subtype), r.propertyType && optionLabel(site, r.propertyType),
                        money(r.budgetMax, lang)].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td data-label={t.status}>
                      <span className={`a-status s-${r.status}`}>{t.statuses[r.status]}</span>
                      {late && <div className="a-late">{fill(t.waiting, { h: Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 3_600_000) })}</div>}
                    </td>
                    <td data-label={t.owner}>{r.owner ?? <span className="a-muted">{t.unassigned}</span>}</td>
                    <td data-label={t.received}>{ago(r.createdAt, lang)}</td>
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
