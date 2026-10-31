import type { Metadata } from "next";
import Link from "next/link";

import { home, PageHead } from "@/components/PageHead";
import { getDictionary } from "@/i18n/dictionaries";
import { getAreas } from "@/lib/content";
import { type LangParams, langOf } from "@/lib/params";
import { pageMetadata } from "@/lib/seo";

const PATH = "/areas";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  const t = getDictionary(lang).pages.areas;
  return pageMetadata(lang, PATH, t.title, t.description);
}

export default async function AreasPage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const t = dict.pages.areas;
  const areas = await getAreas(lang);
  const wilayats = [...new Set(areas.map((a) => a.wilayat || ""))];
  return (
    <>
      <PageHead lang={lang} title={t.title} summary={t.summary}
        crumbs={[home(lang, dict.nav.home), { name: t.title, path: `/${lang}${PATH}` }]} />
      <section className="container section">
        {areas.length === 0 && <p>{t.empty}</p>}
        {wilayats.map((wilayat) => (
          <div key={wilayat} style={{ marginBottom: 28 }}>
            <h2>{wilayat}</h2>
            <div className="grid three">
              {areas.filter((a) => (a.wilayat || "") === wilayat).map((a) => (
                <div className="card" key={a.id}>
                  <h3>{a.name}</h3>
                  <div className="actions">
                    {/* Only areas with a written guide get a page; no thin auto-generated pages (§13.1). */}
                    {a.guide_slug && <Link className="btn secondary" href={`/${lang}/areas/${a.guide_slug}`}>{t.guide}</Link>}
                    <Link className="btn primary" href={`/${lang}/find-me-a-property?areas=${encodeURIComponent(a.id)}`}>
                      {t.searchHere}</Link>
                    <Link className="btn secondary" href={`/${lang}/map?area=${encodeURIComponent(a.id)}`}>{dict.nav.map}</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
