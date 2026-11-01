// Calendar subscription (iCalendar, RFC 5545): each staff member's viewings, follow-ups and scheduled jobs as a private
// link that Google Calendar, Apple Calendar and Outlook can subscribe to. No Google account connection is needed;
// "Make a new link" revokes the old one.
import { randomBytes } from "node:crypto";

import { and, eq, gte, inArray, lt, or } from "drizzle-orm";

import { db } from "@/db";
import { activities, contacts, properties, requests, serviceJobs, users } from "@/db/schema";

import { siteUrl } from "./config";

export async function calendarKey(userId: number, renew = false) {
  if (!renew) {
    const [u] = await db.select({ key: users.calendarKey }).from(users).where(eq(users.id, userId));
    if (u?.key) return u.key;
  }
  const key = randomBytes(24).toString("base64url");
  await db.update(users).set({ calendarKey: key }).where(eq(users.id, userId));
  return key;
}
export const calendarUrl = (key: string) => `${siteUrl}/api/calendar/${key}.ics`;

/** Text values: escape \\ ; , and line breaks; lines folded at 75 octets (approximately, by characters). */
const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => (line.length <= 74 ? line : line.match(/.{1,73}/g)!.join("\r\n "));
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export type CalendarEvent = { uid: string; start: Date; minutes: number; title: string; description: string; url: string; cancelled?: boolean };

export function toIcs(name: string, events: CalendarEvent[]) {
  const now = stamp(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Aqar 360//Staff calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`, "X-WR-TIMEZONE:Asia/Muscat", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@aqar360`, `DTSTAMP:${now}`, `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(new Date(e.start.getTime() + e.minutes * 60_000))}`, `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.description)}`, `URL:${e.url}`,
      `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** The person's own items (and, for viewings, those on requests assigned to them): last 7 days to next 60. */
export async function calendarFor(key: string) {
  const [u] = await db.select().from(users).where(and(eq(users.calendarKey, key), eq(users.active, true)));
  if (!u) return null;
  const from = new Date(Date.now() - 7 * 86_400_000);
  const to = new Date(Date.now() + 60 * 86_400_000);
  const [acts, jobs] = await Promise.all([
    db.select({ a: activities, c: contacts, r: requests, p: properties }).from(activities).innerJoin(contacts, eq(activities.contactId, contacts.id))
      .leftJoin(requests, eq(activities.requestId, requests.id)).leftJoin(properties, eq(activities.propertyId, properties.id))
      .where(and(inArray(activities.type, ["viewing", "follow_up"]), gte(activities.dueAt, from), lt(activities.dueAt, to),
        or(eq(activities.userId, u.id), eq(requests.assignedTo, u.id)))),
    db.select().from(serviceJobs).where(and(eq(serviceJobs.assignedTo, u.id), gte(serviceJobs.scheduledAt, from), lt(serviceJobs.scheduledAt, to))),
  ]);
  const events: CalendarEvent[] = [
    ...acts.map(({ a, c, r, p }) => ({ uid: `activity-${a.id}`, start: a.dueAt!, minutes: a.type === "viewing" ? 60 : 30,
      title: `${a.type === "viewing" ? "Viewing · معاينة" : "Follow-up · متابعة"}: ${c.name}${p ? ` · ${p.code}` : ""}`,
      description: [r?.number, c.phone, a.body, a.source === "online" ? "Booked online" : ""].filter(Boolean).join("\n"),
      url: r ? `${siteUrl}/admin/requests/${r.id}` : `${siteUrl}/admin/customers/${c.id}`, cancelled: a.result === "cancelled" })),
    ...jobs.map((j) => ({ uid: `job-${j.id}`, start: j.scheduledAt!, minutes: 120, title: `Job · عمل: ${j.title}`, description: j.number,
      url: `${siteUrl}/admin/jobs/${j.id}`, cancelled: j.status === "cancelled" })),
  ];
  return toIcs(`Aqar 360 · ${u.name}`, events);
}
