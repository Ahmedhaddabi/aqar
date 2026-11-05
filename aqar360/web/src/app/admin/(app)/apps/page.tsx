import Link from "next/link";

import { adminDict, adminLang, fill } from "@/admin/i18n";
import { Ic } from "@/admin/icons";
import { and, count, eq, inArray, isNull, lt } from "drizzle-orm";

import { omanToday } from "@/admin/hr";
import { arAging, financeSummary } from "@/admin/money";
import { db } from "@/db";
import { approvals, expenseClaims, leaves, requests, serviceJobs, settings } from "@/db/schema";
import { canOpen, openApps, requireUser } from "@/lib/auth";
import { OPEN_JOB, slaOf } from "@/lib/jobs";
import { unreadCount } from "@/lib/notify";


/**
 * The home screen after sign-in (like Frappe's /apps): key numbers on the blue band, then one tile per app the person may open.
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
    ...(apps.includes("crm") ? [{ href: "/admin", name: T.nav.crm, sub: t.crm, text: t.crmText, icon: "inbox" as const }] : []),
    ...(apps.includes("erp") ? [{ href: "/admin/erp", name: T.nav.erp, sub: t.erp, text: t.erpText, icon: "cash" as const }] : []),
    ...(apps.includes("hr") ? [{ href: "/admin/hr", name: T.nav.hrApp, sub: t.hr, text: t.hrText, icon: "id" as const }] : []),
    ...(apps.includes("crm") && user.role !== "agent" ? [{ href: "/admin/agents", name: T.nav.agentsApp, sub: t.agent, text: t.agentText, icon: "spark" as const }] : []),
    ...(user.role === "admin" ? [{ href: "/admin/settings", name: T.nav.setup, sub: t.setup, text: t.setupText, icon: "gear" as const }] : []),
  ];
  return (
    <>
      <section className="a-band">
        <div className="a-band-grid" />
        <div className="a-bandrow">
          <div>
            {unread > 0 && <Link className="a-chip" href="/admin/notifications"><i />{fill(t.unread, { n: unread })}</Link>}
            <h1>{fill(t.hello, { name: user.name.split(" ")[0] })}</h1>
            <p>{tiles.length ? t.intro : t.noApps}</p>
          </div>
        </div>
        {denied && <p className="a-alert">{t.denied}</p>}
        {kpis.length > 0 && (
          <div className="a-kpis" aria-label={T.kpi.title}>
            {kpis.map((k) => (
              <Link key={k.label} href={k.href} className={`a-kpi${k.tone ? ` ${k.tone}` : ""}`}><strong>{k.value}</strong><span>{T.kpi[k.label]}</span></Link>
            ))}
          </div>
        )}
      </section>
      <div className="a-apps">
        {tiles.map((a) => (
          <Link key={a.href} href={a.href} className="a-app">
            <span className="a-app-icon"><Ic name={a.icon} size={22} /></span>
            <h2>{a.sub}<small>{a.name}</small></h2>
            <p>{a.text}</p>
            <span className="a-go">{t.open} <Ic name="chevr" size={14} className="a-flip" /></span>
          </Link>
        ))}
      </div>
    </>
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
