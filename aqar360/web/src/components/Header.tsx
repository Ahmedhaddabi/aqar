"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";

export function Header({ lang, dict, brand }: { lang: Locale; dict: Dictionary; brand: string }) {
  const pathname = usePathname() || `/${lang}`;
  const otherLang: Locale = lang === "ar" ? "en" : "ar";
  const switchHref = pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${otherLang}`);
  const n = dict.nav;
  const primary = [
    ["/find-me-a-property", n.find], ["/market-my-property", n.marketProperty], ["/content-services", n.contentServices],
    ["/consulting", n.consulting], ["/map", n.map], ["/projects", n.projects], ["/areas", n.areas], ["/insights", n.insights],
  ] as const;
  const more = [
    ["/market-my-project", n.marketProject], ["/careers", n.careers], ["/partners-suppliers", n.partners],
    ["/calculators", n.calculators], ["/about", n.about], ["/contact", n.contact],
  ] as const;
  const link = ([path, label]: readonly [string, string]) => {
    const href = `/${lang}${path}`;
    return (
      <Link key={path} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined}>
        {label}
      </Link>
    );
  };

  return (
    <header className="site-header">
      <a className="skip" href="#main">{lang === "ar" ? "انتقل إلى المحتوى" : "Skip to content"}</a>
      <div className="container bar">
        <Link className="brand" href={`/${lang}`}>{brand}</Link>
        <nav className="nav desktop" aria-label={n.menu}>
          {primary.map(link)}
          <details>
            <summary>{n.more}</summary>
            <div className="dropdown">{more.map(link)}</div>
          </details>
          <Link className="lang-switch" href={switchHref} hrefLang={otherLang} lang={otherLang}>{n.switchLanguage}</Link>
        </nav>
        <details className="mobile-menu">
          <summary aria-label={n.menu}>☰ {n.menu}</summary>
          <nav className="panel" aria-label={n.menu}>
            {[...primary, ...more].map(link)}
            <Link href={switchHref} hrefLang={otherLang} lang={otherLang}>{n.switchLanguage}</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
