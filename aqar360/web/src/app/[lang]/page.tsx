import type { Metadata } from "next";
import Link from "next/link";

import { Carousel, CopyNumber, type Slide, Swipe } from "@/components/HomeParts";
import { Icon } from "@/components/Icon";
import { JsonLd } from "@/components/JsonLd";
import { getDictionary, optionLabel } from "@/i18n/dictionaries";
import { companyName } from "@/lib/config";
import { getAreas, getContact, getFormConfig, getPages, getProjects, getServices } from "@/lib/content";
import { formatters } from "@/lib/format";
import { publicReviews } from "@/lib/reviews";
import { type LangParams, langOf } from "@/lib/params";
import { organizationLd, pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  return pageMetadata(lang, "", companyName[lang], getDictionary(lang).meta.description);
}

/** Home page in the customer design: photo hero, search card, map, numbers, featured banners, listings, services, FAQ, contact. */
export default async function HomePage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const h = dict.home;
  const m = dict.pages.map;
  const fmt = formatters(lang);
  const [areas, services, pages, reviews, projects, config, contact] = await Promise.all([getAreas(lang), getServices(lang), getPages(lang),
    publicReviews().catch(() => []), getProjects(lang), getFormConfig(lang), getContact()]);
  const base = `/${lang}`;
  const types = config?.options["Aqar Search Request"]?.property_type ?? [];
  const typeTags = ([["Apartment", h.tags.apartments], ["Villa", h.tags.villas], ["Land", h.tags.land]] as const).filter(([v]) => types.includes(v));
  const priceOf = (p: (typeof projects)[number]) => (p.price_from ? `${h.from} ${fmt.amount(p.price_from)} ${m.currency}` : m.priceOnRequest);
  const arrows = { prev: h.prev, next: h.next };
  const wa = contact.whatsapp ? `https://wa.me/${contact.whatsapp}` : null;
  const slides: Slide[] = [
    ...projects.slice(0, 2).map((p, i) => ({ image: p.image || `/img/photo-${i ? 4 : 5}.jpg`, tag: h.featuredProject, title: p.title ?? "",
      text: [p.area_name, priceOf(p)].filter(Boolean).join(" · "), href: `${base}/projects/${p.slug}`, cta: h.viewProject })),
    { image: "/img/photo-2.jpg", tag: h.slideSellTag, title: h.slideSellTitle, text: h.slideSellText, href: `${base}/market-my-property`, cta: h.slideSellCta },
    { image: "/img/photo-3.jpg", tag: h.slideContentTag, title: h.slideContentTitle, text: h.slideContentText, href: `${base}/content-services`, cta: h.slideContentCta },
  ];

  return (
    <div className="container home">
      <section className="hero2" aria-label={h.heroTitle}>
        <div className="hphoto" style={{ backgroundImage: "url(/img/photo-1.jpg)" }} aria-hidden="true" />
        <div className="h2in">
          <div className="htags">
            {typeTags.map(([value, label]) => (
              <Link key={value} className="glass-chip" href={`${base}/find-me-a-property?property_type=${value}`}>{label}</Link>
            ))}
            <Link className="glass-chip" href={`${base}/projects`}>{h.tags.projects}</Link>
          </div>
          <div className="hrow">
            <h1 className="hero-h">{h.heroLine1}<br />{h.heroLine2}</h1>
            <p className="hero-lead">{h.heroSubtitle}</p>
          </div>
        </div>
      </section>

      {/* Plain GET form: it pre-fills the full request form, nothing is stored yet. */}
      <form className="search" action={`${base}/find-me-a-property`} method="get" aria-label={h.searchTitle}>
        <div className="shd">
          <h2>{h.searchTitle}</h2>
          <div className="seg" role="radiogroup" aria-label={h.quickPurpose}>
            {["Buy", "Rent"].map((v) => (
              <label key={v}><input type="radio" name="purpose" value={v} defaultChecked={v === "Buy"} /><span>{optionLabel(dict, v)}</span></label>
            ))}
          </div>
        </div>
        <div className="sfields">
          <label className="sf">{h.propertyType}
            <select name="property_type" defaultValue="">
              <option value="">{h.anyType}</option>
              {types.map((v) => <option key={v} value={v}>{optionLabel(dict, v)}</option>)}
            </select>
          </label>
          <label className="sf">{h.quickArea}
            <select name="areas" defaultValue="">
              <option value="">{h.anyArea}</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="sf">{h.quickBudget}
            <input name="budget_max" type="number" min={0} inputMode="numeric" placeholder="120000" dir="ltr" />
          </label>
          <label className="sf">{h.bedrooms}
            <select name="bedrooms_min" defaultValue="">
              <option value="">{h.any}</option>
              {[1, 2, 3, 4].map((b) => <option key={b} value={b}>{b}+</option>)}
            </select>
          </label>
          <button className="btn primary sbtn" type="submit"><Icon name="search" size={18} /><span>{h.search}</span></button>
        </div>
        <div className="sfilters">
          <span className="muted">{h.popular}</span>
          {areas.slice(0, 2).map((a) => <Link key={a.id} className="chip" href={`${base}/find-me-a-property?areas=${a.id}`}>{a.name}</Link>)}
          <Link className="chip" href={`${base}/projects`}>{h.readyUnits}</Link>
          <Link className="chip" href={`${base}/market-my-property`}>{h.sellMine}</Link>
        </div>
      </form>

      <Link className="mapcta" href={`${base}/map`}>
        <span className="mctext">
          <span className="mcic"><Icon name="map" size={22} /></span>
          <span><strong>{h.mapTitle}</strong><span className="muted">{h.mapText}</span></span>
        </span>
        <span className="mcmap" aria-hidden="true" />
        <span className="btn primary mcbtn">{h.openMap} <span aria-hidden="true">→</span></span>
      </Link>

      {areas.length > 0 && (
        <div className="ticker" aria-label={dict.nav.areas}>
          <div className="tk">
            {[...areas, ...areas].map((a, i) => <span key={`${a.id}-${i}`} aria-hidden={i >= areas.length || undefined}>{a.name}</span>)}
          </div>
        </div>
      )}

      <section className="blk">
        <div className="shead"><h2>{h.statsTitle}</h2><p className="muted">{h.statsText}</p></div>
        <div className="stats">
          {h.stats.map((s) => <div className="stat" key={s.label}><b dir="ltr">+{s.n}</b><span>{s.label}</span></div>)}
        </div>
      </section>

      <section className="blk" aria-label={h.featured}>
        <Carousel slides={slides} labels={arrows} />
      </section>

      {projects.length > 0 && (
        <section className="blk">
          <div className="shead"><p className="eyebrow">{h.featured}</p><h2>{h.availableTitle}</h2><p className="muted">{h.availableText}</p></div>
          <Swipe labels={arrows} cta={<Link className="btn primary" href={`${base}/projects`}>{h.allProjects}</Link>}>
            {projects.slice(0, 9).map((p) => (
              <Link key={p.id} className="lcard" href={`${base}/projects/${p.slug}`}>
                <span className="ph" style={p.image ? { backgroundImage: `url(${p.image})` } : undefined}>
                  {p.construction_status && <span className="ltag">{m.statuses[p.construction_status] || p.construction_status}</span>}
                </span>
                <span className="lbody">
                  {p.available_units ? <span className="lmeta"><Icon name="building" size={16} />{fmt.count(m.unitsAvailable, p.available_units)}</span> : null}
                  <h3>{p.title}</h3>
                  <span className="lfoot">
                    <span className="lprice">{priceOf(p)}</span>
                    {p.area_name && <span className="muted lloc"><Icon name="pin" size={15} />{p.area_name}</span>}
                  </span>
                </span>
              </Link>
            ))}
          </Swipe>
        </section>
      )}

      <section className="blk">
        <div className="shead"><h2>{h.whyTitle}</h2></div>
        <div className="pillars">
          {h.why.map((item) => <div className="pillar" key={item.title}><h3>{item.title}</h3><p className="muted">{item.text}</p></div>)}
        </div>
      </section>

      {services.length > 0 && (
        <section className="blk">
          <div className="shead"><p className="eyebrow">{h.servicesEyebrow}</p><h2>{h.servicesTitle}</h2><p className="muted">{h.servicesText}</p></div>
          <Swipe labels={arrows} cta={<Link className="btn primary" href={`${base}/content-services`}>{h.servicesLink}</Link>}>
            {services.map((s, i) => (
              <Link key={s.code} className="scard" href={`${base}/content-services`}>
                <span className="ph" style={{ backgroundImage: `url(/img/photo-${(i % 5) + 1}.jpg)` }} />
                <h3>{s.name}</h3>
                <p className="muted">{s.scope}</p>
                {s.price ? <span className="price">{s.price} {dict.pages.contentServices.from}</span> : null}
              </Link>
            ))}
          </Swipe>
        </section>
      )}

      <section className="blk">
        <div className="band">
          <div><h2>{h.consultingTitle}</h2><p className="muted">{h.consultingText}</p></div>
          <Link className="btn light-solid" href={`${base}/consulting`}>{h.consultingCta}</Link>
        </div>
      </section>

      {reviews.length > 0 && (
        <section className="blk">
          <div className="shead"><h2>{dict.reviews.title}</h2></div>
          <div className="pillars">
            {reviews.map((r) => (
              <figure key={r.id} className="pillar review-card">
                <p className="review-stars" aria-label={dict.reviews.stars.replace("{n}", String(r.rating))}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
                {r.comment && <blockquote dir="auto">{r.comment}</blockquote>}
                <figcaption className="muted">{r.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="blk">
        <div className="faqwrap">
          <div className="shead start">
            <p className="eyebrow">{h.faqEyebrow}</p><h2>{h.faqTitle}</h2><p className="muted">{h.faqText}</p>
            {wa && <a className="btn secondary" href={wa} target="_blank" rel="noopener noreferrer">{h.askWhatsapp}</a>}
          </div>
          <div className="qas">
            {h.faq.map((f, i) => <details className="qa" key={f.q} open={i === 0}><summary>{f.q}</summary><p>{f.a}</p></details>)}
          </div>
        </div>
      </section>

      {pages.length > 0 && (
        <section className="blk">
          <div className="shead"><h2>{h.insightsTitle}</h2><Link className="link" href={`${base}/insights`}>{h.insightsLink}</Link></div>
          <div className="guides">
            {pages.slice(0, 2).map((p, i) => (
              <Link key={p.slug} className="gitem" href={`${base}/insights/${p.slug}`}>
                <span className="ph" style={{ backgroundImage: `url(/img/photo-${i ? 2 : 4}.jpg)` }} />
                <span className="muted">{dict.pageTypes[p.page_type] ?? p.page_type}</span>
                <h3>{p.title}</h3>
                <p className="muted">{p.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="blk">
        <div className={contact.phone || contact.email || contact.instagram || contact.facebook ? "band tband" : "band tband solo"}>
          <div className="tleft">
            <p className="glass-chip"><span className="dot" />{h.talkChip}</p>
            <h2>{h.talkTitle}</h2>
            <p className="muted">{h.talkText}</p>
            <div className="tbtns">
              {wa && <a className="btn light-solid" href={wa} target="_blank" rel="noopener noreferrer">{dict.nav.whatsapp}</a>}
              <Link className="btn light" href={`${base}/contact`}>{dict.footer.sendMessage}</Link>
            </div>
          </div>
          <div className="tcards">
            {contact.phone && (
              <div className="tcard">
                <span className="tic"><Icon name="phone" /></span>
                <span className="tcard-text"><span className="tl">{h.phoneWhatsapp}</span><a className="tv" href={`tel:${contact.phone.replace(/\s/g, "")}`} dir="ltr">{contact.phone}</a></span>
                <CopyNumber value={contact.phone} label={h.copyNumber} done={h.copied} />
              </div>
            )}
            {contact.email && (
              <a className="tcard" href={`mailto:${contact.email}`}>
                <span className="tic"><Icon name="mail" /></span>
                <span className="tcard-text"><span className="tl">{h.email}</span><span className="tv" dir="ltr">{contact.email}</span></span>
              </a>
            )}
            {([[contact.instagram, "Instagram", "instagram"], [contact.facebook, "Facebook", "facebook"]] as const).filter(([href]) => href).map(([href, label, icon]) => (
              <a key={label} className="tcard" href={href} target="_blank" rel="noopener noreferrer">
                <span className="tic"><Icon name={icon} /></span>
                <span className="tcard-text"><span className="tl">{label}</span><span className="tv" dir="ltr">{href.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}</span></span>
                <span className="tarrow" aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        </div>
      </section>
      <JsonLd data={organizationLd(lang)} />
    </div>
  );
}
