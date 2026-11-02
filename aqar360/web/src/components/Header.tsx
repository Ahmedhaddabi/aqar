"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";

import { Icon, type IconName } from "./Icon";

/** Set at customer sign-in (not secret, readable by the page): only decides "Log in" vs "My account" on cached pages. */
const SIGNED_IN_HINT = "aqar_signed_in";

type Item = readonly [path: string, label: string, icon: IconName];

/** Customer design: a side menu on wide screens (right side in Arabic), a top bar with a menu button on phones. */
export function Header({ lang, dict, brand }: { lang: Locale; dict: Dictionary; brand: Record<Locale, string> }) {
  const pathname = usePathname() || `/${lang}`;
  const otherLang: Locale = lang === "ar" ? "en" : "ar";
  const switchHref = pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${otherLang}`);
  const n = dict.nav;
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setSignedIn(document.cookie.split("; ").some((c) => c === `${SIGNED_IN_HINT}=1`));
    setOpen(false);
  }, [pathname]);
  const main: Item[] = [
    ["", n.home, "home"], ["/find-me-a-property", n.buyRent, "search"], ["/market-my-property", n.sellLet, "tag"],
    ["/projects", n.projects, "building"], ["/map", n.map, "map"], ["/content-services", n.services, "camera"],
  ];
  const explore: Item[] = [
    ["/areas", n.areas, "pin"], ["/insights", n.insights, "doc"], ["/calculators", n.calculators, "calc"], ["/consulting", n.consulting, "chat"],
    ["/contact", n.contact, "phone"],
  ];
  const company: Item[] = [
    ["/about", n.about, "info"], ["/market-my-project", n.marketProject, "layers"], ["/careers", n.careers, "briefcase"], ["/partners-suppliers", n.partners, "users"],
  ];
  const link = ([path, label, icon]: Item) => {
    const href = `/${lang}${path}`;
    const current = path ? pathname.startsWith(href) : pathname === href;
    return (
      <Link key={path} href={href} aria-current={current ? "page" : undefined}>
        <Icon name={icon} /><span>{label}</span>
      </Link>
    );
  };
  const companyOpen = company.some(([path]) => pathname.startsWith(`/${lang}${path}`));

  return (
    <header className="site-side">
      <a className="skip" href="#main">{lang === "ar" ? "انتقل إلى المحتوى" : "Skip to content"}</a>
      <div className="side-bar">
        <Link className="logo" href={`/${lang}`} aria-label={brand[lang]}>
          <span className="logo-latin">{brand.en}</span><span className="logo-ar" lang="ar">{brand.ar}</span>
        </Link>
        <button type="button" className="menubtn" aria-expanded={open} aria-controls="side-nav" aria-label={n.menu} onClick={() => setOpen(!open)}>
          <span /><span />
        </button>
        <nav id="side-nav" className={open ? "side-nav open" : "side-nav"} aria-label={n.menu}>
          <div className="ngroup">{main.map(link)}</div>
          <p className="nlabel">{n.explore}</p>
          <div className="ngroup">{explore.map(link)}</div>
          <details className="ngroup-more" open={companyOpen || undefined}>
            <summary className="nlabel">{n.company}</summary>
            <div className="ngroup">{company.map(link)}</div>
          </details>
          <div className="side-tools">
            <Link className="btn primary" href={`/${lang}/find-me-a-property`}>{n.startRequest}</Link>
            <div className="ntrow">
              <Link className="lang-switch" href={switchHref} hrefLang={otherLang} lang={otherLang}>{n.switchLanguage}</Link>
              <Link className="authlink" href={`/${lang}/account${signedIn ? "" : "/login"}`}>
                <Icon name="user" size={18} /> {signedIn ? n.account : n.logIn}
              </Link>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
