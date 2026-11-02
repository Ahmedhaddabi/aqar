import Link from "next/link";

import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";

import { Icon } from "./Icon";

const LEGAL = ["terms", "privacy", "marketing-consent", "service-terms", "payment-refunds", "content-terms", "supplier-terms"];
export type SiteContact = { phone: string; whatsapp: string; email: string; instagram: string; facebook: string; threads: string };

/** Customer design footer: brand and social links, three link columns, legal line. Missing contact details are hidden. */
export function Footer({ lang, dict, brand, contact }: { lang: Locale; dict: Dictionary; brand: Record<Locale, string>; contact: SiteContact }) {
  const n = dict.nav;
  const f = dict.footer;
  const col = (title: string, items: [string, string][]) => (
    <nav className="fcol" aria-label={title}>
      <p>{title}</p>
      {items.map(([path, label]) => <Link key={path} href={`/${lang}${path}`}>{label}</Link>)}
    </nav>
  );
  const social = [
    [contact.instagram, "Instagram", "instagram"], [contact.facebook, "Facebook", "facebook"], [contact.threads, "Threads", "threads"],
    [contact.whatsapp && `https://wa.me/${contact.whatsapp}`, "WhatsApp", "whatsapp"],
  ] as const;
  return (
    <footer className="site-foot">
      <div className="container">
        <div className="fgrid">
          <div className="fbrand">
            <Link className="logo" href={`/${lang}`} aria-label={brand[lang]}>
              <span className="logo-latin">{brand.en}</span><span className="logo-ar" lang="ar">{brand.ar}</span>
            </Link>
            <p className="muted">{f.tagline} {f.priceNote}</p>
            <div className="fsoc">
              {social.filter(([href]) => href).map(([href, label, icon]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}><Icon name={icon} size={18} /></a>
              ))}
            </div>
          </div>
          {col(f.explore, [["/find-me-a-property", n.buyRent], ["/market-my-property", n.sellLet], ["/projects", n.projects], ["/map", n.map],
            ["/areas", n.areas], ["/insights", n.insights]])}
          {col(f.services, [["/content-services", n.contentServices], ["/consulting", n.consulting], ["/calculators", n.calculators],
            ["/market-my-project", n.marketProject], ["/careers", n.careers], ["/partners-suppliers", n.partners]])}
          <div className="fcol">
            <p>{f.contact}</p>
            {contact.phone && <a className="num" href={`tel:${contact.phone.replace(/\s/g, "")}`} dir="ltr">{contact.phone}</a>}
            {contact.email && <a href={`mailto:${contact.email}`} dir="ltr">{contact.email}</a>}
            <Link href={`/${lang}/contact`}>{f.sendMessage}</Link>
            <Link href={`/${lang}/account/login`}>{n.logIn}</Link>
          </div>
        </div>
        <div className="fbottom">
          <span>© {new Date().getFullYear()} {brand[lang]}. {f.rights}</span>
          <span className="flegal">{LEGAL.map((slug) => <Link key={slug} href={`/${lang}/legal/${slug}`}>{dict.legalNames[slug]}</Link>)}</span>
        </div>
      </div>
    </footer>
  );
}
