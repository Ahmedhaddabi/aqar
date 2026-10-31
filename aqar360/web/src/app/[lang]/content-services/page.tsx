import type { Metadata } from "next";

import { home, PageHead } from "@/components/PageHead";
import { TrackedLink } from "@/components/TrackedLink";
import { getDictionary } from "@/i18n/dictionaries";
import { getServices } from "@/lib/content";
import { type LangParams, langOf } from "@/lib/params";
import { pageMetadata } from "@/lib/seo";

const PATH = "/content-services";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  const t = getDictionary(lang).pages.contentServices;
  return pageMetadata(lang, PATH, t.title, t.description);
}

export default async function ContentServicesPage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const t = dict.pages.contentServices;
  const services = await getServices(lang);
  const order = `/${lang}/market-my-property?request_type=Content%20Only`;
  return (
    <>
      <PageHead lang={lang} title={t.title} summary={t.summary}
        crumbs={[home(lang, dict.nav.home), { name: t.title, path: `/${lang}${PATH}` }]} />
      <section className="container section">
        <div className="grid three">
          {services.map((s) => (
            <div className="card" key={s.code}>
              <h2 style={{ fontSize: "1.2rem" }}>{s.name}</h2>
              <p className="muted">{s.scope}</p>
              <p className="price">{s.price ? `${s.price} ${t.from}` : t.customQuote}</p>
              <TrackedLink className="btn secondary" href={order} event="content_service_select" params={{ service: s.code }}>
                {t.order}
              </TrackedLink>
            </div>
          ))}
        </div>
        <p className="notice">{t.revisionNote}</p>
        <p className="muted">{dict.footer.priceNote}</p>
      </section>
    </>
  );
}
