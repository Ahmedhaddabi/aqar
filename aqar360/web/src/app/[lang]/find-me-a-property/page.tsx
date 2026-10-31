import type { Metadata } from "next";

import { SearchRequestForm } from "@/components/forms/SearchRequestForm";
import { FormsClosed } from "@/components/forms/FormStates";
import { home, PageHead } from "@/components/PageHead";
import { getDictionary } from "@/i18n/dictionaries";
import { getFormConfig } from "@/lib/content";
import { type LangParams, langOf } from "@/lib/params";
import { pageMetadata } from "@/lib/seo";

const PATH = "/find-me-a-property";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  const t = getDictionary(lang).pages.find;
  return pageMetadata(lang, PATH, t.title, t.description);
}

export default async function FindPropertyPage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const t = dict.pages.find;
  const config = await getFormConfig(lang);
  return (
    <>
      <PageHead lang={lang} title={t.title} summary={t.summary}
        crumbs={[home(lang, dict.nav.home), { name: t.title, path: `/${lang}${PATH}` }]} />
      <section className="container section">
        <ol className="steps">{t.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        <div style={{ marginTop: 28 }}>
          {config ? <SearchRequestForm lang={lang} dict={dict} config={config} /> : <FormsClosed lang={lang} dict={dict} />}
        </div>
      </section>
    </>
  );
}
