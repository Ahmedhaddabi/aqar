import Link from "next/link";

import { money, siteDict } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { listProjects, listProperties } from "@/admin/listings";
import { optionLabel } from "@/i18n/dictionaries";
import { requireApp } from "@/lib/auth";

export default async function ListingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).listings;
  const site = siteDict(lang);
  const { tab: rawTab, q } = await searchParams;
  const tab = rawTab === "properties" ? "properties" : "projects";
  const name = (ar: string | null | undefined, en: string | null | undefined) => (lang === "ar" ? ar || en : en || ar) ?? "";
  const pill = (on: boolean) => <span className={`a-state ${on ? "on" : "off"}`}>{on ? t.yes : t.no}</span>;
  return (
    <>
      <header className="a-head a-request-head">
        <div>
          <h1>{t.title}</h1>
          <p className="a-muted">{t.intro}</p>
        </div>
        <Link className="a-btn primary" href={tab === "projects" ? "/admin/projects/new" : "/admin/properties/new"}>
          + {tab === "projects" ? t.newProject : t.newProperty}</Link>
      </header>
      <div className="a-toolbar">
        <nav className="a-tabs">
          <Link href="/admin/listings?tab=projects" aria-current={tab === "projects" ? "page" : undefined}>{t.projects}</Link>
          <Link href="/admin/listings?tab=properties" aria-current={tab === "properties" ? "page" : undefined}>{t.properties}</Link>
        </nav>
        <form className="a-inline" action="/admin/listings">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={q} aria-label={t.name} />
          <button className="a-btn">⌕</button>
        </form>
      </div>
      <section className="a-panel">
        {tab === "projects" ? (
          <ProjectsTable rows={await listProjects(q)} />
        ) : (
          <PropertiesTable rows={await listProperties(q)} />
        )}
      </section>
    </>
  );

  function ProjectsTable({ rows }: { rows: Awaited<ReturnType<typeof listProjects>> }) {
    if (!rows.length) return <p className="a-muted">{t.none}</p>;
    return (
      <table className="a-table">
        <thead><tr><th>{t.name}</th><th>{t.area}</th><th>{t.price}</th><th>{t.availability}</th><th>{t.onWebsite}</th></tr></thead>
        <tbody>
          {rows.map(({ project: p, area }) => (
            <tr key={p.id}>
              <td data-label={t.name}>
                <Link className="a-row-link" href={`/admin/projects/${p.id}`}><strong>{name(p.nameAr, p.nameEn)}</strong></Link>
                <div className="a-muted">{p.developer}</div>
              </td>
              <td data-label={t.area}>{area ? name(area.nameAr, area.nameEn) : ""}</td>
              <td data-label={t.price}>{money(p.priceFrom, lang)}</td>
              <td data-label={t.availability}>{t.availabilityValues[p.availability]}</td>
              <td data-label={t.onWebsite}>{pill(p.public && p.verified)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function PropertiesTable({ rows }: { rows: Awaited<ReturnType<typeof listProperties>> }) {
    if (!rows.length) return <p className="a-muted">{t.none}</p>;
    return (
      <table className="a-table">
        <thead><tr><th>{t.name}</th><th>{t.area}</th><th>{t.price}</th><th>{t.status}</th><th>{t.onWebsite}</th></tr></thead>
        <tbody>
          {rows.map(({ property: p, area }) => (
            <tr key={p.id}>
              <td data-label={t.name}>
                <Link className="a-row-link" href={`/admin/properties/${p.id}`}><strong>{optionLabel(site, p.kind)} · {p.code}</strong></Link>
                <div className="a-muted">{p.title}</div>
              </td>
              <td data-label={t.area}>{area ? name(area.nameAr, area.nameEn) : ""}</td>
              <td data-label={t.price}>{money(p.purpose === "rent" ? p.rentPrice : p.salePrice ?? p.rentPrice, lang)}</td>
              <td data-label={t.status}>{t.statuses[p.status]} · {t.purposes[p.purpose]}</td>
              <td data-label={t.onWebsite}>{pill(p.public && p.verified)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
}
