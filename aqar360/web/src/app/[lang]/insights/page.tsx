import type { Metadata } from "next";
import Link from "next/link";

import { home, PageHead } from "@/components/PageHead";
import { getDictionary } from "@/i18n/dictionaries";
import { getPages } from "@/lib/content";
import { type LangParams, langOf } from "@/lib/params";
import { pageMetadata } from "@/lib/seo";

const PATH = "/insights";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  const t = getDictionary(lang).pages.insights;
  return pageMetadata(lang, PATH, t.title, t.description);
}

export default async function InsightsPage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const t = dict.pages.insights;
  const pages = await getPages(lang);
  return (
    <>
      <PageHead lang={lang} title={t.title} summary={t.summary}
        crumbs={[home(lang, dict.nav.home), { name: t.title, path: `/${lang}${PATH}` }]} />
      <section className="container section">
        {pages.length === 0 && <p>{t.empty}</p>}
        <div className="grid three">
          {pages.map((p) => (
            <Link className="card" key={p.slug} href={`/${lang}/insights/${p.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
              <span className="tag">{dict.pageTypes[p.page_type] ?? p.page_type}</span>
              <h2 style={{ fontSize: "1.15rem", marginTop: 8 }}>{p.title}</h2>
              <p className="muted">{p.summary}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
