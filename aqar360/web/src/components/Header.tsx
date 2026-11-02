"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";

/** Set at customer sign-in (not secret, readable by the page): only decides "Log in" vs "My account" on cached pages. */
const SIGNED_IN_HINT = "aqar_signed_in";

export function Header({ lang, dict, brand }: { lang: Locale; dict: Dictionary; brand: Record<Locale, string> }) {
  const pathname = usePathname() || `/${lang}`;
  const otherLang: Locale = lang === "ar" ? "en" : "ar";
  const switchHref = pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${otherLang}`);
  const n = dict.nav;
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { setSignedIn(document.cookie.split("; ").some((c) => c === `${SIGNED_IN_HINT}=1`)); }, [pathname]);
  const primary = [
    ["/find-me-a-property", n.find], ["/market-my-property", n.marketProperty], ["/projects", n.projects], ["/map", n.map],
    ["/content-services", n.contentServices],
  ] as const;
  const more = [
    ["/areas", n.areas], ["/insights", n.insights], ["/consulting", n.consulting], ["/calculators", n.calculators],
    ["/market-my-project", n.marketProject], ["/careers", n.careers], ["/partners-suppliers", n.partners], ["/about", n.about], ["/contact", n.contact],
  ] as const;
  const link = ([path, label]: readonly [string, string]) => {
    const href = `/${lang}${path}`;
    return (
      <Link key={path} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined}>
        {label}
      </Link>
    );
  };
  const account = <Link className="authlink" href={`/${lang}/account${signedIn ? "" : "/login"}`}>{signedIn ? n.account : n.logIn}</Link>;

  return (
    <header className="site-header">
      <a className="skip" href="#main">{lang === "ar" ? "انتقل إلى المحتوى" : "Skip to content"}</a>
      <div className="container bar">
        <Link className="brand" href={`/${lang}`} aria-label={brand[lang]}>
          <span className="brand-latin">{brand.en}</span><span className="brand-ar" lang="ar">{brand.ar}</span>
        </Link>
        <nav className="nav desktop" aria-label={n.menu}>
          {primary.map(link)}
          <details>
            <summary>{n.more}</summary>
            <div className="dropdown">{more.map(link)}</div>
          </details>
        </nav>
        <div className="navtools desktop">
          <Link className="lang-switch" href={switchHref} hrefLang={otherLang} lang={otherLang}>{n.switchLanguage}</Link>
          {account}
          <Link className="btn primary" href={`/${lang}/find-me-a-property`}>{n.startRequest}</Link>
        </div>
        <details className="mobile-menu">
          <summary aria-label={n.menu}>☰ {n.menu}</summary>
          <nav className="panel" aria-label={n.menu}>
            {[...primary, ...more].map(link)}
            <div className="panel-tools">
              <Link className="btn primary" href={`/${lang}/find-me-a-property`}>{n.startRequest}</Link>
              {account}
              <Link className="lang-switch" href={switchHref} hrefLang={otherLang} lang={otherLang}>{n.switchLanguage}</Link>
            </div>
          </nav>
        </details>
      </div>
    </header>
  );
}
