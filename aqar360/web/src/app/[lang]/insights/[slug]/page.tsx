import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContentArticle } from "@/components/ContentArticle";
import { home, PageHead } from "@/components/PageHead";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/config";
import { getPage } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string; slug: string }> };

async function load(params: Props["params"]) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const page = await getPage(lang, slug);
  if (!page || page.page_type === "Area Guide") notFound();
  return { lang: lang as Locale, slug, page };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug, page } = await load(params);
  return pageMetadata(lang, `/insights/${slug}`, page.seo_title, page.meta_description);
}

export default async function InsightPage({ params }: Props) {
  const { lang, slug, page } = await load(params);
  const dict = getDictionary(lang);
  const path = `/${lang}/insights/${slug}`;
  return (
    <>
      <PageHead lang={lang} title={page.title}
        crumbs={[home(lang, dict.nav.home), { name: dict.pages.insights.title, path: `/${lang}/insights` }, { name: page.title, path }]} />
      <ContentArticle lang={lang} dict={dict} page={page} path={path} />
    </>
  );
}
