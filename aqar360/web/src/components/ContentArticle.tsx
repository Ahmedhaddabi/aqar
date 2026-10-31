import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";
import type { ContentPage } from "@/lib/content";
import { articleLd, faqLd } from "@/lib/seo";

import { JsonLd } from "./JsonLd";

/** Guide layout: answer first, fact block, body, FAQ, sources and review date (§14.2, §15.5). */
export function ContentArticle({ lang, dict, page, path }: { lang: Locale; dict: Dictionary; page: ContentPage; path: string }) {
  const t = dict.pages.insights;
  const reviewed = page.last_reviewed
    ? new Intl.DateTimeFormat(lang === "ar" ? "ar-OM" : "en-GB", { dateStyle: "long" }).format(new Date(page.last_reviewed))
    : null;
  return (
    <article className="container section article">
      {page.summary && <p className="answer">{page.summary}</p>}
      {page.facts.length > 0 && (
        <table className="facts">
          <caption className="muted" style={{ textAlign: "start" }}>{t.facts}</caption>
          <tbody>{page.facts.map((f) => <tr key={f.label}><th scope="row">{f.label}</th><td>{f.value}</td></tr>)}</tbody>
        </table>
      )}
      {/* Body HTML is sanitised by Frappe on save and again by the content API. */}
      <div className="prose" dangerouslySetInnerHTML={{ __html: page.body }} />
      {page.faqs.length > 0 && (
        <section className="faq">
          <h2>{t.faq}</h2>
          {page.faqs.map((f) => (
            <details key={f.question}><summary>{f.question}</summary><p>{f.answer}</p></details>
          ))}
          <JsonLd data={faqLd(page.faqs)} />
        </section>
      )}
      {page.sources && (<section><h2>{t.sources}</h2><p style={{ whiteSpace: "pre-line" }}>{page.sources}</p></section>)}
      {reviewed && <p className="muted">{t.lastReviewed}: {reviewed}</p>}
      <JsonLd data={articleLd(lang, path, page.title, page.meta_description || page.summary, page.modified)} />
    </article>
  );
}
