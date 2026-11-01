import { and, asc, eq, gte, inArray, lt, or } from "drizzle-orm";
import Link from "next/link";

import { visibleTo } from "@/admin/crm";
import { CheckInButton, InstallHint } from "@/admin/FieldParts";
import { whatsappLink } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { activities, contacts, properties, requests, serviceJobs } from "@/db/schema";
import { canOpen, requireApp } from "@/lib/auth";

import { setViewingResult } from "../../deal-actions";

const time = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: "Asia/Muscat" }).format(d) : "");

/** The phone screen for staff in the field (strategy §26.8): today's viewings and follow-ups, check-in, results, quick actions. */
export default async function FieldPage() {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.field;
  // Today in Oman (UTC+4).
  const start = new Date(new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10) + "T00:00:00+04:00");
  const end = new Date(start.getTime() + 86_400_000);
  const [items, jobs] = await Promise.all([
    db.select({ a: activities, r: requests, c: contacts, p: properties }).from(activities)
      .innerJoin(requests, eq(activities.requestId, requests.id)).innerJoin(contacts, eq(activities.contactId, contacts.id))
      .leftJoin(properties, eq(activities.propertyId, properties.id))
      .where(and(inArray(activities.type, ["viewing", "follow_up", "call"]), eq(activities.done, false), lt(activities.dueAt, end),
        or(eq(activities.userId, user.id), eq(requests.assignedTo, user.id)), visibleTo(user)))
      .orderBy(asc(activities.dueAt)).limit(40),
    canOpen(user, "erp") ? db.select().from(serviceJobs).where(and(eq(serviceJobs.assignedTo, user.id), gte(serviceJobs.scheduledAt, start), lt(serviceJobs.scheduledAt, end)))
      .orderBy(asc(serviceJobs.scheduledAt)) : Promise.resolve([]),
  ]);
  return (
    <div className="f-page">
      <header className="a-head"><h1>📱 {t.title}</h1><p className="a-muted">{t.intro}</p></header>
      <InstallHint text={t.install} button={t.installButton} />
      <nav className="f-quick">
        <Link className="f-tile" href="/admin/requests/new">➕<span>{T.nav.newEntry}</span></Link>
        <Link className="f-tile" href="/admin/listings">📷<span>{t.photos}</span></Link>
        <Link className="f-tile" href="/admin/claims">🧾<span>{t.receipt}</span></Link>
        <Link className="f-tile" href="/admin/search">🔍<span>{T.search.title}</span></Link>
      </nav>
      <h2>{t.today}</h2>
      {items.length === 0 && jobs.length === 0 && <p className="a-muted">{t.nothing}</p>}
      <ul className="f-list">
        {items.map(({ a, r, c, p }) => {
          const wa = whatsappLink(c.phone);
          const late = a.dueAt && a.dueAt < start;
          const map = p?.lat && p?.lng ? `https://maps.google.com/?q=${p.lat},${p.lng}` : null;
          return (
            <li key={a.id} className={`f-card${late ? " late" : ""}`}>
              <div className="f-card-head">
                <strong>{time(a.dueAt)} · {T.crm.activityTypes[a.type]}</strong>
                <Link href={`/admin/requests/${r.id}`} dir="ltr">{r.number}</Link>
              </div>
              <p className="f-name">{c.name}{p ? ` · ${p.code}${p.unitNumber ? ` ${p.unitNumber}` : ""}` : ""}</p>
              {a.body && <p className="a-muted" dir="auto">{a.body}</p>}
              <div className="f-actions">
                {c.phone && <a className="a-btn f-btn" href={`tel:${c.phone}`}>📞 {T.crm.call}</a>}
                {wa && <a className="a-btn f-btn wa" href={wa} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
                {map && <a className="a-btn f-btn" href={map} target="_blank" rel="noreferrer">🗺 {t.directions}</a>}
                {a.type === "viewing" && <CheckInButton activityId={a.id} label={t.checkIn} done={t.checkedIn} />}
              </div>
              {a.type === "viewing" && (
                <div className="f-actions">
                  {(["interested", "not_suitable", "wants_alternatives", "no_show"] as const).map((res) => (
                    <form key={res} action={setViewingResult}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="result" value={res} />
                      <button className="a-btn small">{T.match.results[res]}</button></form>
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {jobs.map((j) => (
          <li key={`j${j.id}`} className="f-card">
            <div className="f-card-head"><strong>{time(j.scheduledAt)} · 🎬 {T.jobs.title}</strong><Link href={`/admin/jobs/${j.id}`} dir="ltr">{j.number}</Link></div>
            <p className="f-name" dir="auto">{j.title}</p>
            {j.brief?.address && <p className="a-muted" dir="auto">📍 {j.brief.address}</p>}
            <div className="f-actions">
              {j.brief?.mapLink && <a className="a-btn f-btn" href={j.brief.mapLink} target="_blank" rel="noreferrer">🗺 {t.directions}</a>}
              {j.brief?.sitePhone && <a className="a-btn f-btn" href={`tel:${j.brief.sitePhone}`}>📞 {j.brief.siteContact || T.crm.call}</a>}
              <Link className="a-btn f-btn" href={`/admin/jobs/${j.id}#documents`}>📷 {t.uploadPhotos}</Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
