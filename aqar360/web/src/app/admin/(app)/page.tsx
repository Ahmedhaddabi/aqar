import { and, count, eq, isNull } from "drizzle-orm";
import Link from "next/link";

import { change, StatTile } from "@/admin/charts";
import { todayFor } from "@/admin/crm";
import { suggestionsToReview } from "@/admin/deals";
import { ago, dateTime, money } from "@/admin/format";
import { expiringSoon } from "@/admin/hr";
import { adminDict, adminLang, fill } from "@/admin/i18n";
import { last14 } from "@/admin/trends";
import { db } from "@/db";
import { agentOpenCount } from "@/lib/agent";
import { projects, properties } from "@/db/schema";
import { canOpen, requireApp } from "@/lib/auth";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.crm;
  const { denied } = await searchParams;
  const n = async (query: Promise<{ n: number }[]>) => (await query)[0].n;
  const [today, projectCount, propertyCount, suggestions] = await Promise.all([
    todayFor(user),
    n(db.select({ n: count() }).from(projects).where(and(eq(projects.public, true), eq(projects.verified, true)))),
    n(db.select({ n: count() }).from(properties).where(and(eq(properties.public, true), isNull(properties.projectId)))),
    suggestionsToReview(),
  ]);
  // Office staff get a pointer to the ERP when staff documents or company renewals end within 30 days.
  const expiring = user.role === "agent" ? [] : await expiringSoon(30);
  const cards: [string, number, string, string?][] = [
    [t.newToday, today.newWaiting, "/admin/requests?tab=new", today.newWaiting ? "alert" : undefined],
    [t.overdue, today.overdue, "/admin/requests?tab=new", today.overdue ? "danger" : undefined],
    [t.dueToday, today.due.length, "#due"],
    [T.match.toReview, suggestions, "/admin/requests?tab=open", suggestions ? "alert" : undefined],
    ...(user.role === "agent" ? [] : [[T.agent.waiting + " · " + T.nav.agentsApp, await agentOpenCount(), "/admin/agents", undefined] as [string, number, string, undefined]]),
    [T.today.projects, projectCount, `/${lang}/projects`],
    [T.today.properties, propertyCount, `/${lang}/map`],
  ];
  // Office staff see the whole business trend; agents keep their own lists.
  const trend = user.role === "agent" ? null : await last14(canOpen(user, "erp"));
  const C = T.charts;
  return (
    <>
      <section className="a-band">
        <div className="a-band-grid" />
        <div className="a-bandrow">
          <div>
            {expiring.length > 0 && <Link className="a-chip" href="/admin/erp"><i />{T.today.expiring}: {expiring.length}</Link>}
            <h1>{fill(T.today.hello, { name: user.name.split(" ")[0] })}</h1>
            <p>{T.today.intro}</p>
          </div>
          <div className="a-inline">
            <Link className="a-btn primary" href="/admin/requests/new">+ {T.nav.newEntry}</Link>
            <Link className="a-btn" href="/admin/requests">{T.nav.requests}</Link>
          </div>
        </div>
        {denied && <p className="a-alert">{T.today.denied}</p>}
        <div className="a-cards">
          {cards.map(([label, value, href, tone]) => (
            <Link className={`a-card${tone ? ` ${tone}` : ""}`} key={label} href={href}><strong>{value}</strong><span>{label}</span></Link>
          ))}
        </div>
      </section>
      {trend && (
        <section className="a-panel">
          <h2>{C.last14}</h2>
          <div className="viz-stats">
            <StatTile lang={lang} label={C.newRequests} value={String(trend.created.total)} values={trend.created.values}
              delta={change(trend.created.total, trend.created.before)} deltaLabel={C.vsBefore} href="/admin/reports" />
            <StatTile lang={lang} label={C.won} value={String(trend.won.total)} values={trend.won.values}
              delta={change(trend.won.total, trend.won.before)} deltaLabel={C.vsBefore} href="/admin/requests" />
            <StatTile lang={lang} label={C.waIn} value={String(trend.wa.total)} values={trend.wa.values}
              delta={change(trend.wa.total, trend.wa.before)} deltaLabel={C.vsBefore} href="/admin/whatsapp" />
            {trend.income && <StatTile lang={lang} label={C.income14} value={money(trend.income.total, lang)} values={trend.income.values}
              delta={change(trend.income.total, trend.income.before)} deltaLabel={C.vsBefore} href="/admin/finance" />}
          </div>
        </section>
      )}
      <div className="a-two">
        <section className="a-panel">
          <h2>{t.newToday}</h2>
          {today.latest.length === 0 ? <p className="a-muted">{t.none}</p> : (
            <ul className="a-list">
              {today.latest.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/requests/${r.id}`}><strong>{r.customer}</strong></Link>
                  <span className="a-muted">{t.kinds[r.kind]} · {ago(r.createdAt, lang)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="a-panel" id="due">
          <h2>{t.dueToday}</h2>
          {today.due.length === 0 ? <p className="a-muted">{t.none}</p> : (
            <ul className="a-list">
              {today.due.map(({ activity: a, requestId, customer }) => (
                <li key={a.id} className={a.dueAt && new Date(a.dueAt) < new Date() ? "late" : ""}>
                  <Link href={requestId ? `/admin/requests/${requestId}` : `/admin/customers/${a.contactId}`}>
                    <strong>{t.activityTypes[a.type]}</strong> · {customer}
                  </Link>
                  <span className="a-muted">{dateTime(a.dueAt, lang)}{a.body ? ` · ${a.body.slice(0, 80)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
