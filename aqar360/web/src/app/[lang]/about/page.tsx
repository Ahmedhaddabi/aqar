import type { Metadata } from "next";

import { home, PageHead } from "@/components/PageHead";
import { getDictionary } from "@/i18n/dictionaries";
import { type LangParams, langOf } from "@/lib/params";
import { pageMetadata } from "@/lib/seo";

const PATH = "/about";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  const t = getDictionary(lang).pages.about;
  return pageMetadata(lang, PATH, t.title, t.description);
}

export default async function AboutPage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const t = dict.pages.about;
  return (
    <>
      <PageHead lang={lang} title={t.title} crumbs={[home(lang, dict.nav.home), { name: t.title, path: `/${lang}${PATH}` }]} />
      <section className="container section article">
        {t.paragraphs.map((p) => <p key={p}>{p}</p>)}
        <h2>{dict.home.trustTitle}</h2>
        <ul>{dict.home.trust.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
    </>
  );
}
