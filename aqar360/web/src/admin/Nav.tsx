"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { logout, setLanguage } from "@/app/admin/actions";

import type { AdminDict, AdminLang } from "./i18n";
import { type AdminIcon, Ic } from "./icons";
import { THEME_KEY } from "./theme";

export type NavItem = { href: string; label: string; icon: AdminIcon };
export type NavGroup = { label: string; items: NavItem[] };
export type NavModule = { key: "crm" | "erp" | "hr" | "agents"; label: string; home: string; groups: NavGroup[] };

const isActive = (href: string, pathname: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
// Pages under these paths belong to an app even when they are not menu items (detail pages).
const OWNERS: Record<string, NavModule["key"]> = { "/admin/requests": "crm", "/admin/customers": "crm", "/admin/projects": "crm",
  "/admin/properties": "crm", "/admin/invoices": "erp", "/admin/jobs": "erp", "/admin/hr": "hr", "/admin/hiring": "hr" };

/**
 * Customer admin design: a glass side rail (brand, app switch, the app's menu in groups, general pages, the person) and a
 * glass top bar (where you are, search, new, language, light/dark, website, notifications). On phones the rail slides in.
 */
export function Nav({ modules, personal, unread, t, lang, userName, roleLabel, newHref }: {
  modules: NavModule[]; personal: NavItem[]; unread: number; t: AdminDict["nav"]; lang: AdminLang; userName: string; roleLabel: string;
  newHref: string | null;
}) {
  const pathname = usePathname() || "/admin";
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const items = (m: NavModule) => m.groups.flatMap((g) => g.items);
  const best = modules.flatMap((m) => items(m).map((i) => ({ m, i }))).filter(({ i }) => isActive(i.href, pathname))
    .sort((a, b) => b.i.href.length - a.i.href.length)[0];
  const owner = Object.entries(OWNERS).find(([p]) => pathname.startsWith(p))?.[1];
  const current = best?.m ?? modules.find((m) => m.key === owner) ?? modules[0];
  const page = [...(current ? items(current) : []), ...personal].filter((i) => isActive(i.href, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0];

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); search.current?.focus(); }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode: this page only */ }
    setDark(!dark);
  };

  const link = (item: NavItem) => (
    <Link key={item.href} className="a-nav" href={item.href} aria-current={page?.href === item.href ? "page" : undefined}>
      <Ic name={item.icon} /><span>{item.label}</span>
    </Link>
  );
  return (
    <>
      <aside className={open ? "a-side open" : "a-side"} aria-label={t.menu}>
        <Link href="/admin/apps" className="a-brand-row">
          <span className="a-mark">360</span>
          <span><b>{lang === "ar" ? "عقار 360" : "Aqar 360"}</b><small>{t.admin}</small></span>
        </Link>
        {modules.length > 1 && (
          <nav className="a-switch" aria-label={t.apps}>
            {modules.map((m) => <Link key={m.key} href={m.home} aria-current={m.key === current?.key ? "true" : undefined}>{m.label}</Link>)}
          </nav>
        )}
        <nav className="a-menu" aria-label={current?.label ?? t.menu}>
          <div className="a-navgrp">
            <Link className="a-nav" href="/admin/apps" aria-current={pathname === "/admin/apps" ? "page" : undefined}><Ic name="grid" /><span>{t.allApps}</span></Link>
          </div>
          {current?.groups.map((g) => (
            <div className="a-navgrp" key={g.label}><span className="a-lbl">{g.label}</span>{g.items.map(link)}</div>
          ))}
          <div className="a-navgrp"><span className="a-lbl">{t.general}</span>{personal.map(link)}</div>
        </nav>
        <div className="a-railfoot">
          <Link href="/admin/account" className="a-me">
            <span className="a-av">{userName.trim().charAt(0).toUpperCase()}</span>
            <span className="a-grow"><b>{userName}</b><small>{roleLabel}</small></span>
          </Link>
          <form action={logout}><button className="a-iconbtn" aria-label={t.signOut} title={t.signOut}><Ic name="out" size={17} className="a-flip" /></button></form>
        </div>
      </aside>
      {open && <div className="a-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <header className="a-topbar">
        <button type="button" className="a-iconbtn a-menubtn" aria-label={t.menu} aria-expanded={open} onClick={() => setOpen(true)}><Ic name="menu" /></button>
        <div className="a-crumbs">
          {current && <span className="a-parent">{current.label}</span>}
          {current && page && <span className="a-sep"><Ic name="chevr" size={14} className="a-flip" /></span>}
          <b>{page?.label ?? (pathname === "/admin/apps" ? t.allApps : "")}</b>
        </div>
        <form action="/admin/search" className="a-kbar" role="search">
          <Ic name="search" size={16} />
          <input ref={search} name="q" placeholder={t.jump} aria-label={t.search} />
          <kbd>Ctrl K</kbd>
        </form>
        {newHref && <Link className="a-btn primary a-hide-sm" href={newHref}><Ic name="plus" size={16} /><span>{t.newShort}</span></Link>}
        <form action={setLanguage}>
          <input type="hidden" name="lang" value={lang === "ar" ? "en" : "ar"} />
          <input type="hidden" name="path" value={pathname} />
          <button className="a-langbtn" aria-label={t.language} title={t.language}>{t.langShort}</button>
        </form>
        <button type="button" className="a-iconbtn a-hide-sm" onClick={toggleTheme} aria-label={t.theme} title={t.theme}><Ic name={dark ? "sun" : "moon"} /></button>
        <a className="a-iconbtn a-hide-sm" href={`/${lang}`} target="_blank" rel="noreferrer" aria-label={t.website} title={t.website}><Ic name="ext" /></a>
        <Link className="a-iconbtn" href="/admin/notifications" aria-label={t.notifications} title={t.notifications}>
          <Ic name="bell" />{unread > 0 && <span className="a-dot">{unread > 99 ? "99+" : unread}</span>}
        </Link>
      </header>
    </>
  );
}

