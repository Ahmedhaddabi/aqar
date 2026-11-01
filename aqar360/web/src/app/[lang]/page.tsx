import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/JsonLd";
import { getDictionary, optionLabel } from "@/i18n/dictionaries";
import { companyName } from "@/lib/config";
import { getAreas, getPages, getServices } from "@/lib/content";
import { publicReviews } from "@/lib/reviews";
import { type LangParams, langOf } from "@/lib/params";
import { organizationLd, pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  return pageMetadata(lang, "", companyName[lang], getDictionary(lang).meta.description);
}

export default async function HomePage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const h = dict.home;
  const [areas, services, pages, reviews] = await Promise.all([getAreas(lang), getServices(lang), getPages(lang),
    publicReviews().catch(() => [])]);
  const base = `/${lang}`;

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>{h.heroTitle}</h1>
          <p>{h.heroSubtitle}</p>
          <div className="ctas">
            <Link href={`${base}/find-me-a-property?purpose=Buy`}>{h.ctaBuy}</Link>
            <Link href={`${base}/find-me-a-property?purpose=Rent`}>{h.ctaRent}</Link>
            <Link href={`${base}/market-my-property?request_type=Sell`}>{h.ctaSell}</Link>
            <Link href={`${base}/market-my-property?request_type=Let`}>{h.ctaLet}</Link>
          </div>
        </div>
      </section>

      <section className="section map-teaser-section">
        <div className="container">
          <Link className="map-teaser" href={`${base}/map`}>
            <span className="map-teaser-icon" aria-hidden="true" />
            <span>
              <strong>{h.mapTitle}</strong>
              <span>{h.mapText}</span>
            </span>
            <span className="btn primary">{h.mapCta}</span>
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="container card">
          <h2>{h.quickTitle}</h2>
          {/* Plain GET form: it pre-fills the full request form, no data is stored yet. */}
          <form className="quick" action={`${base}/find-me-a-property`} method="get">
            <div className="field">
              <label htmlFor="q-purpose">{h.quickPurpose}</label>
              <select id="q-purpose" name="purpose" defaultValue="Buy">
                {["Buy", "Rent"].map((v) => <option key={v} value={v}>{optionLabel(dict, v)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="q-area">{h.quickArea}</label>
              <select id="q-area" name="areas" defaultValue="">
                <option value="">—</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="q-budget">{h.quickBudget}</label>
              <input id="q-budget" name="budget_max" type="number" min={0} inputMode="numeric" />
            </div>
            <button className="btn primary" type="submit">{h.quickStart}</button>
          </form>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <h2>{h.whyTitle}</h2>
          <div className="grid four">
            {h.why.map((item) => <div className="card" key={item.title}><h3>{item.title}</h3><p>{item.text}</p></div>)}
          </div>
        </div>
      </section>

      {services.length > 0 && (
        <section className="section">
          <div className="container">
            <h2>{h.servicesTitle}</h2>
            <div className="grid four">
              {services.slice(0, 4).map((s) => (
                <div className="card" key={s.code}>
                  <h3>{s.name}</h3>
                  <p className="muted">{s.scope}</p>
                  {s.price ? <p className="price">{s.price} {dict.pages.contentServices.from}</p> : null}
                </div>
              ))}
            </div>
            <p style={{ marginTop: 16 }}><Link href={`${base}/content-services`}>{h.servicesLink} →</Link></p>
          </div>
        </section>
      )}

      <section className="section alt">
        <div className="container grid two" style={{ alignItems: "center" }}>
          <div>
            <h2>{h.consultingTitle}</h2>
            <p>{h.consultingText}</p>
          </div>
          <div><Link className="btn primary" href={`${base}/consulting`}>{h.consultingCta}</Link></div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>{h.trustTitle}</h2>
          <div className="grid three">{h.trust.map((text) => <div className="card" key={text}><p>{text}</p></div>)}</div>
        </div>
      </section>

      {pages.length > 0 && (
        <section className="section alt">
          <div className="container">
            <h2>{h.insightsTitle}</h2>
            <div className="grid three">
              {pages.slice(0, 3).map((p) => (
                <Link className="card" key={p.slug} href={`${base}/insights/${p.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="tag">{dict.pageTypes[p.page_type] ?? p.page_type}</span>
                  <h3 style={{ marginTop: 8 }}>{p.title}</h3>
                  <p className="muted">{p.summary}</p>
                </Link>
              ))}
            </div>
            <p style={{ marginTop: 16 }}><Link href={`${base}/insights`}>{h.insightsLink} →</Link></p>
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="section alt">
          <div className="container">
            <h2>{dict.reviews.title}</h2>
            <div className="grid three">
              {reviews.map((r) => (
                <figure key={r.id} className="card review-card">
                  <p className="review-stars" aria-label={dict.reviews.stars.replace("{n}", String(r.rating))}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
                  {r.comment && <blockquote dir="auto">{r.comment}</blockquote>}
                  <figcaption>{r.name}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container">
          <h2>{h.joinTitle}</h2>
          <div className="grid two">
            <Link className="card" href={`${base}/careers`} style={{ textDecoration: "none", color: "inherit" }}>
              <h3>{dict.nav.careers}</h3><p>{h.careersText}</p></Link>
            <Link className="card" href={`${base}/partners-suppliers`} style={{ textDecoration: "none", color: "inherit" }}>
              <h3>{dict.nav.partners}</h3><p>{h.partnersText}</p></Link>
          </div>
        </div>
      </section>
      <JsonLd data={organizationLd(lang)} />
    </>
  );
}
