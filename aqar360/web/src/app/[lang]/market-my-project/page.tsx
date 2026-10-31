import type { Metadata } from "next";

import { FormsClosed } from "@/components/forms/FormStates";
import { PropertyIntakeForm } from "@/components/forms/PropertyIntakeForm";
import { home, PageHead } from "@/components/PageHead";
import { getDictionary } from "@/i18n/dictionaries";
import { getFormConfig } from "@/lib/content";
import { type LangParams, langOf } from "@/lib/params";
import { pageMetadata } from "@/lib/seo";

const PATH = "/market-my-project";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  const t = getDictionary(lang).pages.marketProject;
  return pageMetadata(lang, PATH, t.title, t.description);
}

export default async function MarketProjectPage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const t = dict.pages.marketProject;
  const config = await getFormConfig(lang);
  return (
    <>
      <PageHead lang={lang} title={t.title} summary={t.summary}
        crumbs={[home(lang, dict.nav.home), { name: t.title, path: `/${lang}${PATH}` }]} />
      <section className="container section">
        <p className="notice">{dict.pages.marketProperty.reviewNotice}</p>
        {config ? <PropertyIntakeForm lang={lang} dict={dict} config={config} project /> : <FormsClosed lang={lang} dict={dict} />}
      </section>
    </>
  );
}
