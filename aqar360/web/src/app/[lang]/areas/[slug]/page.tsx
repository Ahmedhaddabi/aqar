import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentArticle } from "@/components/ContentArticle";
import { home, PageHead } from "@/components/PageHead";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/config";
import { getAreas, getPage } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string; slug: string }> };

async function load(params: Props["params"]) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const page = await getPage(lang, slug);
  if (!page || page.page_type !== "Area Guide") notFound();
  return { lang: lang as Locale, slug, page };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug, page } = await load(params);
  return pageMetadata(lang, `/areas/${slug}`, page.seo_title, page.meta_description);
}

export default async function AreaGuidePage({ params }: Props) {
  const { lang, slug, page } = await load(params);
  const dict = getDictionary(lang);
  const path = `/${lang}/areas/${slug}`;
  const area = (await getAreas(lang)).find((a) => a.guide_slug === slug);
  return (
    <>
      <PageHead lang={lang} title={page.title}
        crumbs={[home(lang, dict.nav.home), { name: dict.pages.areas.title, path: `/${lang}/areas` }, { name: page.title, path }]} />
      <ContentArticle lang={lang} dict={dict} page={page} path={path} />
      {area && (
        <section className="container" style={{ paddingBottom: 32 }}>
          <Link className="btn primary" href={`/${lang}/find-me-a-property?areas=${encodeURIComponent(area.id)}`}>
            {dict.pages.areas.searchHere}</Link>
        </section>
      )}
    </>
  );
}
