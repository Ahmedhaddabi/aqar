import type { Metadata } from "next";
import Link from "next/link";

import { home, PageHead } from "@/components/PageHead";
import { TrackedLink } from "@/components/TrackedLink";
import { getDictionary } from "@/i18n/dictionaries";
import { contact } from "@/lib/config";
import { type LangParams, langOf } from "@/lib/params";
import { pageMetadata } from "@/lib/seo";

const PATH = "/contact";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  const t = getDictionary(lang).pages.contact;
  return pageMetadata(lang, PATH, t.title, t.description);
}

export default async function ContactPage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const t = dict.pages.contact;
  const any = contact.phone || contact.whatsapp || contact.email;
  return (
    <>
      <PageHead lang={lang} title={t.title} crumbs={[home(lang, dict.nav.home), { name: t.title, path: `/${lang}${PATH}` }]} />
      <section className="container section">
        {!any && <p className="notice">{t.notYet}</p>}
        <div className="grid three">
          {contact.whatsapp && (
            <div className="card"><h2 style={{ fontSize: "1.1rem" }}>{t.whatsapp}</h2>
              <TrackedLink className="btn primary" href={`https://wa.me/${contact.whatsapp}`} event="whatsapp_click">
                +{contact.whatsapp}</TrackedLink></div>
          )}
          {contact.phone && (
            <div className="card"><h2 style={{ fontSize: "1.1rem" }}>{t.phone}</h2>
              <TrackedLink className="btn secondary" href={`tel:${contact.phone}`} event="call_click">
                <span dir="ltr">{contact.phone}</span></TrackedLink></div>
          )}
          {contact.email && (
            <div className="card"><h2 style={{ fontSize: "1.1rem" }}>{t.email}</h2>
              <a href={`mailto:${contact.email}`}>{contact.email}</a></div>
          )}
        </div>
        <div className="actions" style={{ marginTop: 24 }}>
          <Link className="btn secondary" href={`/${lang}/find-me-a-property`}>{dict.nav.find}</Link>
          <Link className="btn secondary" href={`/${lang}/market-my-property`}>{dict.nav.marketProperty}</Link>
          <Link className="btn secondary" href={`/${lang}/consulting`}>{dict.nav.consulting}</Link>
        </div>
      </section>
    </>
  );
}
