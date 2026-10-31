"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout, setLanguage } from "@/app/admin/actions";

import type { AdminDict, AdminLang } from "./i18n";

export type NavItem = { href: string; label: string; icon: string };
export type NavModule = { key: "crm" | "erp" | "hr"; label: string; home: string; items: NavItem[] };

const isActive = (href: string, pathname: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
// Pages under these paths belong to an app even when they are not menu items (detail pages).
const OWNERS: Record<string, NavModule["key"]> = { "/admin/requests": "crm", "/admin/customers": "crm", "/admin/projects": "crm",
  "/admin/properties": "crm", "/admin/invoices": "erp", "/admin/jobs": "erp", "/admin/hr": "hr", "/admin/hiring": "hr" };

/**
 * Inside an app (like Frappe): the app's name at the top with a way back to the apps screen, only that app's pages,
 * then the person's own pages (claims, account) and, for admins, setup.
 */
export function Nav({ modules, personal, unread, t, lang, userName, roleLabel }: {
  modules: NavModule[]; personal: NavItem[]; unread: number; t: AdminDict["nav"]; lang: AdminLang; userName: string; roleLabel: string;
}) {
  const pathname = usePathname() || "/admin";
  const best = modules.flatMap((m) => m.items.map((i) => ({ m, i }))).filter(({ i }) => isActive(i.href, pathname))
    .sort((a, b) => b.i.href.length - a.i.href.length)[0]?.m;
  const owner = Object.entries(OWNERS).find(([p]) => pathname.startsWith(p))?.[1];
  const current = best ?? modules.find((m) => m.key === owner) ?? modules[0];
  const link = (item: NavItem) => {
    // The most specific menu item wins (e.g. "Payroll" rather than "People" on /admin/hr/payroll).
    const active = isActive(item.href, pathname) && !current?.items.some((o) => o.href.length > item.href.length && isActive(o.href, pathname));
    return (
      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
        <span aria-hidden="true">{item.icon}</span>{item.label}
      </Link>
    );
  };
  return (
    <aside className="a-side">
      <div className="a-side-top">
        <Link href="/admin/apps" className="a-apps-btn" title={t.apps} aria-label={t.apps}>▦</Link>
        <Link href={current?.home ?? "/admin/apps"} className="a-logo">{current?.label ?? (lang === "ar" ? "عقار 360" : "Aqar 360")}</Link>
        <Link href="/admin/notifications" className="a-bell" aria-label={t.notifications}>🔔{unread > 0 && <span className="a-badge">{unread}</span>}</Link>
      </div>
      <form action="/admin/search" className="a-side-search" role="search">
        <input name="q" placeholder={t.search} aria-label={t.search} />
      </form>
      {modules.length > 1 && (
        <div className="a-switch" role="tablist" aria-label={t.apps} style={{ gridTemplateColumns: `repeat(${modules.length}, 1fr)` }}>
          {modules.map((m) => (
            <Link key={m.key} href={m.home} role="tab" aria-selected={m.key === current?.key} className={m.key === current?.key ? "on" : ""}>{m.label}</Link>
          ))}
        </div>
      )}
      {current && <nav aria-label={current.label}>{current.items.map(link)}</nav>}
      <nav aria-label={t.account} className="a-nav-setup">{personal.map(link)}</nav>
      <div className="a-side-foot">
        <p><strong>{userName}</strong><span>{roleLabel}</span></p>
        <a href={`/${lang}`} target="_blank" rel="noreferrer">{t.website} ↗</a>
        <form action={setLanguage}>
          <input type="hidden" name="lang" value={lang === "ar" ? "en" : "ar"} />
          <input type="hidden" name="path" value={pathname} />
          <button className="a-link">{t.language}</button>
        </form>
        <form action={logout}><button className="a-link">{t.signOut}</button></form>
      </div>
    </aside>
  );
}
