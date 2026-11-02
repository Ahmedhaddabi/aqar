import Link from "next/link";

import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";

const LEGAL = ["terms", "privacy", "marketing-consent", "service-terms", "payment-refunds", "content-terms", "supplier-terms"];

export function Footer({ lang, dict, brand }: { lang: Locale; dict: Dictionary; brand: string }) {
  const n = dict.nav;
  const explore = [
    ["/find-me-a-property", n.find], ["/market-my-property", n.marketProperty], ["/market-my-project", n.marketProject],
    ["/content-services", n.contentServices], ["/consulting", n.consulting], ["/careers", n.careers],
    ["/partners-suppliers", n.partners], ["/calculators", n.calculators], ["/contact", n.contact],
  ];
  return (
    <footer className="site-footer">
      <div className="container grid three">
        <div>
          <h3>{brand}</h3>
          <p>{dict.footer.tagline}</p>
          <p className="muted">{dict.footer.priceNote}</p>
        </div>
        <div>
          <h3>{dict.footer.explore}</h3>
          <ul>{explore.map(([path, label]) => <li key={path}><Link href={`/${lang}${path}`}>{label}</Link></li>)}</ul>
        </div>
        <div>
          <h3>{dict.footer.legal}</h3>
          <ul>{LEGAL.map((slug) => <li key={slug}><Link href={`/${lang}/legal/${slug}`}>{dict.legalNames[slug]}</Link></li>)}</ul>
        </div>
      </div>
      <div className="container bottom">© {new Date().getFullYear()} {brand}. {dict.footer.rights}</div>
    </footer>
  );
}
