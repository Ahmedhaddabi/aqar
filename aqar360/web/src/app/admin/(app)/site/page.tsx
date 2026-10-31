import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { dateOnly, siteDict } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { areas, pages, wilayats } from "@/db/schema";
import { requireApp } from "@/lib/auth";

export default async function SitePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).site;
  const tab = (await searchParams).tab === "pages" ? "pages" : "areas";
  const name = (ar: string | null | undefined, en: string | null | undefined) => (lang === "ar" ? ar || en : en || ar) ?? "";
  return (
    <>
      <header className="a-head a-request-head">
        <div><h1>{t.title}</h1><p className="a-muted">{t.intro}</p></div>
        <Link className="a-btn primary" href={tab === "areas" ? "/admin/site/areas/new" : "/admin/site/pages/new"}>
          + {tab === "areas" ? t.addArea : t.addPage}</Link>
      </header>
      <nav className="a-tabs a-toolbar">
        {(["areas", "pages"] as const).map((k) => <Link key={k} href={`/admin/site?tab=${k}`} aria-current={k === tab ? "page" : undefined}>{t.tabs[k]}</Link>)}
      </nav>
      <section className="a-panel">
        {tab === "areas" ? (
          <table className="a-table">
            <tbody>
              {(await db.select({ area: areas, wilayat: wilayats }).from(areas).leftJoin(wilayats, eq(areas.wilayatId, wilayats.id))
                .orderBy(asc(areas.nameEn))).map(({ area, wilayat }) => (
                <tr key={area.id} className={area.active ? "" : "muted"}>
                  <td><Link className="a-row-link" href={`/admin/site/areas/${area.id}`}><strong>{name(area.nameAr, area.nameEn)}</strong></Link>
                    <div className="a-muted">{name(wilayat?.nameAr, wilayat?.nameEn)}</div></td>
                  <td>{area.lat ? "📍" : ""} {area.boundary ? "✏️" : ""}</td>
                  <td><span className={`a-state ${area.active ? "on" : "off"}`}>{area.active ? t.active : t.hidden}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="a-table">
            <tbody>
              {(await db.select().from(pages).orderBy(desc(pages.updatedAt))).map((p) => (
                <tr key={p.id}>
                  <td><Link className="a-row-link" href={`/admin/site/pages/${p.id}`}><strong>{name(p.titleAr, p.titleEn)}</strong></Link>
                    <div className="a-muted">{siteDict(lang).pageTypes[p.type] ?? p.type}</div></td>
                  <td>{p.lastReviewed ? dateOnly(p.lastReviewed, lang) : ""}</td>
                  <td><span className={`a-state ${p.published ? "on" : "off"}`}>{p.published ? t.published : t.hidden}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
