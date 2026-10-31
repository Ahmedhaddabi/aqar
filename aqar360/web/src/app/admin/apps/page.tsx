import Link from "next/link";

import { adminDict, adminLang, fill } from "@/admin/i18n";
import { and, count, eq, inArray, isNull, lt } from "drizzle-orm";

import { omanToday } from "@/admin/hr";
import { arAging, financeSummary } from "@/admin/money";
import { db } from "@/db";
import { approvals, expenseClaims, leaves, requests, serviceJobs, settings } from "@/db/schema";
import { canOpen, openApps, requireUser } from "@/lib/auth";
import { OPEN_JOB, slaOf } from "@/lib/jobs";
import { unreadCount } from "@/lib/notify";

import { logout, setLanguage } from "../actions";

/**
 * The home screen after sign-in (like Frappe's /apps or a Citrix workspace): one big tile per app the person may open.
 * Inside an app the menu shows only that app's pages.
 */
export default async function LauncherPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.launcher;
  const [unread, { denied }] = await Promise.all([unreadCount(user.id), searchParams]);
  const apps = openApps(user);
  const kpis = user.role === "agent" ? [] : await keyNumbers(user);
  const tiles = [
    ...(apps.includes("crm") ? [{ href: "/admin", name: T.nav.crm, sub: t.crm, text: t.crmText, icon: "🤝", color: "#0e7c7b" }] : []),
    ...(apps.includes("erp") ? [{ href: "/admin/erp", name: T.nav.erp, sub: t.erp, text: t.erpText, icon: "🏦", color: "#1c4a73" }] : []),
    ...(apps.includes("hr") ? [{ href: "/admin/hr", name: T.nav.hrApp, sub: t.hr, text: t.hrText, icon: "🪪", color: "#7a4fb5" }] : []),
    ...(user.role === "admin" ? [{ href: "/admin/settings", name: T.nav.setup, sub: t.setup, text: t.setupText, icon: "⚙️", color: "#5b6b7c" }] : []),
  ];
  return (
    <main className="a-launcher">
      <header className="a-launcher-top">
        <strong className="a-launcher-brand">{lang === "ar" ? "عقار 360" : "Aqar 360"}</strong>
        <nav className="a-launcher-links">
          <Link href="/admin/notifications" className="a-bell">🔔{unread > 0 && <span className="a-badge">{unread}</span>}</Link>
          <Link href="/admin/account">{T.nav.account}</Link>
          <form action={setLanguage}><input type="hidden" name="lang" value={lang === "ar" ? "en" : "ar"} />
            <input type="hidden" name="path" value="/admin/apps" /><button className="a-link">{T.nav.language}</button></form>
          <form action={logout}><button className="a-link">{T.nav.signOut}</button></form>
        </nav>
      </header>
      <section className="a-launcher-body">
        <h1>{fill(t.hello, { name: user.name.split(" ")[0] })}</h1>
        <p className="a-muted">{tiles.length ? t.intro : t.noApps}</p>
        {denied && <p className="a-alert">{t.denied}</p>}
        {unread > 0 && <p><Link href="/admin/notifications">🔔 {fill(t.unread, { n: unread })}</Link></p>}
        {kpis.length > 0 && (
          <div className="a-kpis" aria-label={T.kpi.title}>
            {kpis.map((k) => (
              <Link key={k.label} href={k.href} className={`a-kpi${k.tone ? ` ${k.tone}` : ""}`}><strong>{k.value}</strong><span>{T.kpi[k.label]}</span></Link>
            ))}
          </div>
        )}
        <div className="a-launcher-grid">
          {tiles.map((a) => (
            <Link key={a.href} href={a.href} className="a-tile">
              <span className="a-tile-icon" style={{ background: a.color }} aria-hidden="true">{a.icon}</span>
              <span className="a-tile-name">{a.name}</span>
              <span className="a-tile-sub">{a.sub}</span>
              <span className="a-tile-text">{a.text}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

type Kpi = { label: "newRequests" | "lateReplies" | "lateJobs" | "income" | "owed" | "approvals"; value: string | number; href: string; tone?: "warn" | "bad" };

/** The admin wireframe's executive numbers (strategy §22): only those the person's apps allow. */
async function keyNumbers(user: Parameters<typeof canOpen>[0]): Promise<Kpi[]> {
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
  const out: Kpi[] = [];
  if (canOpen(user, "crm")) {
    const [row] = await db.select().from(settings).where(eq(settings.key, "firstResponseHours"));
    const hours = Number(row?.value) || 2;
    const [waiting, late] = await Promise.all([
      n(db.select({ n: count() }).from(requests).where(eq(requests.status, "new"))),
      n(db.select({ n: count() }).from(requests).where(and(eq(requests.status, "new"), isNull(requests.firstResponseAt),
        lt(requests.createdAt, new Date(Date.now() - hours * 3_600_000))))),
    ]);
    out.push({ label: "newRequests", value: waiting, href: "/admin/requests?tab=new", tone: waiting ? "warn" : undefined },
      { label: "lateReplies", value: late, href: "/admin/requests?tab=new", tone: late ? "bad" : undefined });
  }
  if (canOpen(user, "erp")) {
    const today = omanToday();
    const [jobs, month, aging, pending] = await Promise.all([
      db.select().from(serviceJobs).where(inArray(serviceJobs.status, [...OPEN_JOB])),
      financeSummary(`${today.slice(0, 7)}-01`, today),
      arAging(today),
      Promise.all([n(db.select({ n: count() }).from(approvals).where(eq(approvals.status, "pending"))),
        n(db.select({ n: count() }).from(expenseClaims).where(eq(expenseClaims.status, "pending"))),
        canOpen(user, "hr") ? n(db.select({ n: count() }).from(leaves).where(eq(leaves.status, "pending"))) : Promise.resolve(0)]).then((v) => v.reduce((a, b) => a + b, 0)),
    ]);
    const lateJobs = jobs.filter((j) => slaOf(j) === "red").length;
    const owed = Object.values(aging).reduce((a, b) => a + b, 0);
    out.push({ label: "lateJobs", value: lateJobs, href: "/admin/jobs", tone: lateJobs ? "bad" : undefined },
      { label: "income", value: `${Math.round(month.income).toLocaleString("en")} OMR`, href: "/admin/finance" },
      { label: "owed", value: `${Math.round(owed).toLocaleString("en")} OMR`, href: "/admin/invoices?tab=unpaid", tone: aging.d60 + aging.d90 + aging.d90p > 0 ? "warn" : undefined },
      { label: "approvals", value: pending, href: "/admin/approvals", tone: pending ? "warn" : undefined });
  }
  return out;
}
