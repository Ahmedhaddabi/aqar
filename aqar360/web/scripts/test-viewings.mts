// Online viewings, saved properties and the portal pages, end to end against the database. Creates a test customer,
// request, property and sent suggestion, then removes everything it made. No messages leave the system (the test
// customer has no email and WhatsApp is not used). Run: npm run test:viewings [-- http://localhost:3000]
import { and, eq, inArray, like, or } from "drizzle-orm";

import { db } from "@/db";
import { activities, auditLog, contacts, matches, notifications, outbox, properties, requests, savedProperties } from "@/db/schema";
import { portalLink } from "@/lib/doc-link";
import { bookOnline, cancelOnline, DEFAULT_RULES, freeSlots, muscatDay, muscatTime, slotsForMatch, suggestionsFor, toggleSaved } from "@/lib/viewings";

const base = process.argv[2];
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const tag = `T${Date.now().toString(36)}`;
const [contact] = await db.insert(contacts).values({ name: `Viewing Test ${tag}`, source: "Test" }).returning();
const [other] = await db.insert(contacts).values({ name: `Other Test ${tag}`, source: "Test" }).returning();
const [prop] = await db.insert(properties).values({ code: `TEST-${tag}`, kind: "Apartment", purpose: "rent", rentPrice: 450, bedrooms: 2,
  status: "available" }).returning();
const [req] = await db.insert(requests).values({ number: `TEST-${tag}`, kind: "search", subtype: "Rent", contactId: contact.id, status: "working",
  language: "en" }).returning();
const [match] = await db.insert(matches).values({ requestId: req.id, propertyId: prop.id, key: `test:${tag}`, score: 90, matchType: "within",
  price: 450, status: "sent", sentAt: new Date() }).returning();

try {
  // Opening hours: Sat-Thu 9-18, 60-minute slots, 24 hours' notice, 14 days ahead (the defaults).
  const now = new Date("2026-11-04T06:00:00Z"); // Wednesday 10:00 in Muscat
  const days = await freeSlots({ agentId: null, propertyId: prop.id, rules: DEFAULT_RULES, now });
  check("no Fridays offered", days.every((d) => new Date(`${d.day}T00:00:00Z`).getUTCDay() !== 5));
  check("first day respects 24 hours' notice", days[0].day === "2026-11-05" && muscatTime(days[0].slots[0]) === "10:00", `${days[0].day} ${muscatTime(days[0].slots[0])}`);
  check("hours 09:00-17:00 starts", days[1].slots.map(muscatTime).join() === "09:00,10:00,11:00,12:00,13:00,14:00,15:00,16:00,17:00");
  check("14 days ahead at most", days.at(-1)!.day <= "2026-11-18");

  // Real booking (rules from Settings, current time).
  const live = await slotsForMatch(contact.id, match.id);
  check("suggestion is bookable", !!live && live.days.length > 0);
  check("another customer cannot see it", (await slotsForMatch(other.id, match.id)) === null);
  const [s1, s2, s3, s4] = live!.days.flatMap((d) => d.slots).slice(0, 4).map((s) => s.toISOString());
  const first = await bookOnline(contact.id, match.id, s1);
  check("booking accepted", first.ok);
  const [a1] = first.ok ? await db.select().from(activities).where(eq(activities.id, first.activityId)) : [];
  check("viewing saved as online", a1?.type === "viewing" && a1.source === "online" && a1.propertyId === prop.id);
  const [r1] = await db.select().from(requests).where(eq(requests.id, req.id));
  check("request moved to Viewing", r1.status === "viewing");
  const [ob] = first.ok ? await db.select().from(outbox).where(eq(outbox.key, `viewing_booked:${first.activityId}`)) : [];
  check("confirmation queued (no email on file → skipped)", ob?.templateKey === "viewing_booked" && ob.status === "skipped" && ob.reason === "no_email");
  const again = await bookOnline(contact.id, match.id, s1);
  check("same time refused", !again.ok && again.reason === "taken");
  check("time no longer offered", !(await slotsForMatch(contact.id, match.id))!.days.some((d) => d.slots.some((s) => s.toISOString() === s1)));
  check("invalid time refused", !(await bookOnline(contact.id, match.id, "2020-01-01T05:00:00.000Z")).ok);
  check("someone else's suggestion refused", !(await bookOnline(other.id, match.id, s2)).ok);

  // Two customers race for the same time: exactly one wins.
  const race = await Promise.all([bookOnline(contact.id, match.id, s2), bookOnline(contact.id, match.id, s2)]);
  check("parallel booking: one wins", race.filter((r) => r.ok).length === 1, JSON.stringify(race));
  const won = race.find((r) => r.ok) as { ok: true; activityId: number };

  // Reschedule: the new time is booked, the old one cancelled.
  const moved = await bookOnline(contact.id, match.id, s3, won.activityId);
  const [old] = await db.select().from(activities).where(eq(activities.id, won.activityId));
  check("reschedule books the new time", moved.ok);
  check("reschedule cancels the old time", old.done && old.result === "cancelled");

  // Limit of upcoming online viewings (3).
  const fourth = await bookOnline(contact.id, match.id, s4);
  check("third upcoming viewing allowed", fourth.ok);
  const fifth = await bookOnline(contact.id, match.id, live!.days.flatMap((d) => d.slots)[5].toISOString());
  check("fourth upcoming viewing refused (limit)", !fifth.ok && fifth.reason === "limit");

  // Cancel: only the owner of the viewing.
  check("other customer cannot cancel", !(await cancelOnline(other.id, (first as { activityId: number }).activityId)));
  check("customer cancels own viewing", await cancelOnline(contact.id, (first as { activityId: number }).activityId));
  // notify() stores one row per recipient, keyed "<key>:<userId>".
  const [n] = await db.select().from(notifications).where(like(notifications.key, `viewing_cancelled:${(first as { activityId: number }).activityId}:%`));
  check("managers told about the cancellation (request not assigned)", !!n && n.kind === "viewing_cancelled");

  // Saved ❤
  check("save", (await toggleSaved(contact.id, match.id)) === true);
  const list = await suggestionsFor(contact.id);
  check("suggestion shows saved + upcoming viewing", list.length === 1 && list[0].saved && !!list[0].viewing && list[0].rent && list[0].price === 450);
  check("unsave", (await toggleSaved(contact.id, match.id)) === false);
  check("other customer cannot save it", (await toggleSaved(other.id, match.id)) === null);
  check("days are Muscat dates", muscatDay(new Date("2026-11-04T21:00:00Z")) === "2026-11-05");

  // Portal pages over HTTP (needs a running site).
  if (base) {
    const link = portalLink(contact.id).replace(/^https?:\/\/[^/]+/, "");
    const home = await fetch(base + link);
    const html = await home.text();
    const parts = { status200: home.status === 200, viewings: html.includes("My viewings"), property: html.includes(`TEST-${tag}`),
      booked: html.includes("📅"), change: html.includes("Change"), saveButton: html.includes("Save") };
    check("portal shows viewings and suggestions", Object.values(parts).every(Boolean), JSON.stringify(parts));
    const book = await fetch(`${base}${link.replace("/portal/home", "/portal/book")}&m=${match.id}`);
    const bookHtml = await book.text();
    check("booking page lists free times", book.status === 200 && bookHtml.includes('name="slot"') && bookHtml.includes("Confirm booking"));
    const forged = await fetch(`${base}/portal/book?c=${contact.id}&e=9999999999&s=forged&m=${match.id}`, { redirect: "manual" });
    check("forged portal link refused", forged.status === 307 && (forged.headers.get("location") ?? "").includes("expired"));
  }
} finally {
  const acts = await db.select({ id: activities.id }).from(activities).where(eq(activities.contactId, contact.id));
  const ids = acts.map((a) => a.id);
  await db.delete(notifications).where(or(like(notifications.title, `%TEST-${tag}%`),
    ...ids.flatMap((id) => [like(notifications.key, `viewing_booked:${id}:%`), like(notifications.key, `viewing_cancelled:${id}:%`)]),
    like(notifications.key, `saved:${contact.id}:%`)));
  await db.delete(outbox).where(eq(outbox.contactId, contact.id));
  await db.delete(auditLog).where(and(inArray(auditLog.action, ["viewing_booked_online", "viewing_cancelled_online"]), eq(auditLog.entityId, String(req.id))));
  await db.delete(savedProperties).where(eq(savedProperties.contactId, contact.id));
  await db.delete(activities).where(eq(activities.contactId, contact.id));
  await db.delete(matches).where(eq(matches.id, match.id));
  await db.delete(requests).where(eq(requests.id, req.id));
  await db.delete(properties).where(eq(properties.id, prop.id));
  await db.delete(contacts).where(inArray(contacts.id, [contact.id, other.id]));
}
const [left] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, contact.id));
check("test data removed", !left);
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
