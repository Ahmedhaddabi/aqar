import type { Metadata } from "next";

import { Calculators } from "@/components/Calculators";
import { home, PageHead } from "@/components/PageHead";
import { getDictionary } from "@/i18n/dictionaries";
import { type LangParams, langOf } from "@/lib/params";
import { pageMetadata } from "@/lib/seo";

const PATH = "/calculators";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  const t = getDictionary(lang).pages.calculators;
  return pageMetadata(lang, PATH, t.title, t.description);
}

/** Mortgage, affordability and rental-yield calculators; everything is worked out in the browser, nothing is sent. */
export default async function CalculatorsPage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const t = dict.pages.calculators;
  return (
    <>
      <PageHead lang={lang} title={t.title} summary={t.summary} crumbs={[home(lang, dict.nav.home), { name: t.title, path: `/${lang}${PATH}` }]} />
      <section className="container section"><Calculators lang={lang} t={t} /></section>
    </>
  );
}
