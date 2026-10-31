import type { Metadata } from "next";

import { ApplyForm } from "@/components/forms/ApplyForm";
import { home, PageHead } from "@/components/PageHead";
import { getDictionary } from "@/i18n/dictionaries";
import { captchaRequired } from "@/lib/intake";
import { type LangParams, langOf } from "@/lib/params";
import { pageMetadata } from "@/lib/seo";

const PATH = "/partners-suppliers";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  const t = getDictionary(lang).pages.partners;
  return pageMetadata(lang, PATH, t.title, t.description);
}

export default async function PartnersPage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const t = dict.pages.partners;
  return (
    <>
      <PageHead lang={lang} title={t.title} summary={t.summary}
        crumbs={[home(lang, dict.nav.home), { name: t.title, path: `/${lang}${PATH}` }]} />
      <section className="container section">
        <h2>{t.categoriesTitle}</h2>
        <div className="grid three">{t.categories.map((c) => <div className="card" key={c}>{c}</div>)}</div>
        <h2 style={{ marginTop: 32 }}>{t.stepsTitle}</h2>
        <ol className="steps">{t.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <p className="notice warn">{t.notPromise}</p>
        <div style={{ marginTop: 24 }}><ApplyForm kind="supplier" lang={lang} dict={dict} captcha={captchaRequired()} /></div>
      </section>
    </>
  );
}
