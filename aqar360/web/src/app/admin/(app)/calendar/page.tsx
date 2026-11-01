import { and, asc, eq, gte, inArray, lt, notInArray, or } from "drizzle-orm";
import Link from "next/link";

import { adminDict, adminLang, fill } from "@/admin/i18n";
import { db } from "@/db";
import { activities, contacts, properties, requests, serviceJobs, users } from "@/db/schema";
import { canOpen, requireApp } from "@/lib/auth";
import { muscatDay, muscatTime } from "@/lib/viewings";

const DAY = 86_400_000;
const OFFSET = 4 * 3_600_000;

type Item = { id: string; at: Date; kind: "viewing" | "follow_up" | "job"; title: string; sub: string; href: string; agent: string | null;
  online: boolean; done: boolean; result: string | null };

/**
 * The team's week: viewings, follow-ups and scheduled service jobs, Sunday to Saturday in Muscat time. Agents see their
 * own; managers and admins see everyone or pick one person.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string; agent?: string }> }) {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.cal;
  const q = await searchParams;
  const base = /^\d{4}-\d{2}-\d{2}$/.test(q.week ?? "") ? new Date(`${q.week}T00:00:00Z`) : new Date(`${muscatDay(new Date())}T00:00:00Z`);
  const sunday = new Date(base.getTime() - base.getUTCDay() * DAY);
  const from = new Date(sunday.getTime() - OFFSET);
  const to = new Date(from.getTime() + 7 * DAY);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const manager = user.role !== "agent";
  const agentId = manager ? Number(q.agent) || null : user.id;

  const staff = manager ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.name)) : [];
  const mine = (col: typeof activities.userId | typeof serviceJobs.assignedTo) => (agentId ? eq(col, agentId) : undefined);
  const [acts, jobs] = await Promise.all([
    db.select({ a: activities, r: requests, c: contacts, p: properties, u: users }).from(activities)
      .innerJoin(contacts, eq(activities.contactId, contacts.id)).leftJoin(requests, eq(activities.requestId, requests.id))
      .leftJoin(properties, eq(activities.propertyId, properties.id)).leftJoin(users, eq(activities.userId, users.id))
      .where(and(inArray(activities.type, ["viewing", "follow_up"]), gte(activities.dueAt, from), lt(activities.dueAt, to),
        agentId ? or(mine(activities.userId), eq(requests.assignedTo, agentId)) : undefined))
      .orderBy(asc(activities.dueAt)),
    canOpen(user, "erp") || !manager
      ? db.select({ j: serviceJobs, u: users }).from(serviceJobs).leftJoin(users, eq(serviceJobs.assignedTo, users.id))
        .where(and(gte(serviceJobs.scheduledAt, from), lt(serviceJobs.scheduledAt, to), notInArray(serviceJobs.status, ["cancelled"]), mine(serviceJobs.assignedTo)))
      : Promise.resolve([]),
  ]);
  const items: Item[] = [
    ...acts.map(({ a, r, c, p, u }) => ({ id: `a${a.id}`, at: a.dueAt!, kind: a.type as "viewing" | "follow_up", title: c.name,
      sub: [p?.code, r?.number, a.type === "follow_up" ? a.body.slice(0, 60) : ""].filter(Boolean).join(" · "),
      href: r ? `/admin/requests/${r.id}` : `/admin/customers/${c.id}`, agent: u?.name ?? null, online: a.source === "online", done: a.done, result: a.result })),
    ...jobs.map(({ j, u }) => ({ id: `j${j.id}`, at: j.scheduledAt!, kind: "job" as const, title: j.title, sub: j.number, href: `/admin/jobs/${j.id}`,
      agent: u?.name ?? null, online: false, done: j.status === "completed", result: null })),
  ].sort((x, y) => x.at.getTime() - y.at.getTime());

  const today = muscatDay(new Date());
  const days = Array.from({ length: 7 }, (_, i) => iso(new Date(sunday.getTime() + i * DAY)));
  const label = (day: string) => new Intl.DateTimeFormat(lang === "ar" ? "ar-OM" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${day}T00:00:00Z`));
  const link = (week: Date) => `/admin/calendar?week=${iso(week)}${manager && agentId ? `&agent=${agentId}` : ""}`;
  const counts = { viewing: items.filter((i) => i.kind === "viewing" && !i.done).length, online: items.filter((i) => i.online && !i.done).length };
  return (
    <>
      <header className="a-head"><h1>📅 {t.title}</h1><p className="a-muted">{t.intro}</p></header>
      <div className="a-toolbar">
        <div className="a-inline">
          <Link className="a-btn small" href={link(new Date(sunday.getTime() - 7 * DAY))}>{lang === "ar" ? "→" : "←"} {t.prev}</Link>
          <Link className="a-btn small" href={`/admin/calendar${manager && agentId ? `?agent=${agentId}` : ""}`}>{t.thisWeek}</Link>
          <Link className="a-btn small" href={link(new Date(sunday.getTime() + 7 * DAY))}>{t.next} {lang === "ar" ? "←" : "→"}</Link>
          <span className="a-muted">{fill(t.summary, counts)}</span>
        </div>
        {manager && (
          <form className="a-inline" action="/admin/calendar">
            <input type="hidden" name="week" value={iso(sunday)} />
            <select name="agent" defaultValue={agentId ?? ""} aria-label={t.who}>
              <option value="">{t.everyone}</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="a-btn small">{t.show}</button>
          </form>
        )}
      </div>
      <div className="a-cal">
        {days.map((day) => {
          const list = items.filter((i) => muscatDay(i.at) === day);
          return (
            <section key={day} className={`a-cal-day${day === today ? " today" : ""}`} aria-label={label(day)}>
              <h2>{label(day)}</h2>
              {list.length === 0 ? <p className="a-muted">—</p> : list.map((i) => (
                <Link key={i.id} href={i.href} className={`a-cal-item k-${i.kind}${i.done ? " done" : ""}`}>
                  <span className="a-cal-time" dir="ltr">{muscatTime(i.at)}</span>
                  <strong dir="auto">{t.kinds[i.kind]} · {i.title}</strong>
                  {i.sub && <span className="a-muted" dir="auto">{i.sub}</span>}
                  <span className="a-muted">{[i.agent ?? t.unassigned, i.online ? `🌐 ${t.online}` : "",
                    i.result === "cancelled" ? T.match.cancelled : i.result ? T.match.results[i.result] ?? i.result : ""].filter(Boolean).join(" · ")}</span>
                </Link>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
