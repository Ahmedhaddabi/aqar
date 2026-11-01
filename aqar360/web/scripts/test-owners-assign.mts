// Owner dashboard, fair auto-assignment and the weekly report, end to end against the database. Uses temporary staff,
// customers, requests and properties, restores the settings it changes, and removes everything it made.
// Run: npm run test:owners [-- http://localhost:3000]
import { and, eq, inArray, like, or } from "drizzle-orm";

import { db } from "@/db";
import { activities, areas, auditLog, contacts, matches, notifications, offers, properties, propertyViews, requests, savedProperties, settings,
  users } from "@/db/schema";
import { autoAssign, maybeRunAssignments, pickAgent, reassignOverdue } from "@/lib/assign";
import { portalLink } from "@/lib/doc-link";
import { ownerDashboard } from "@/lib/owners";
import { reportText, sendWeeklyReport, weeklyReport } from "@/lib/weekly";

const base = process.argv[2];
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const tag = `T${Date.now().toString(36)}`;
const KIND = `TestFlat${tag}`; // a made-up type so real listings never count as "similar"
const KEYS = ["assignAuto", "reassignHours", "assignRunAt", "weeklyReportSent"];
const savedSettings = await db.select().from(settings).where(inArray(settings.key, KEYS));
const setSetting = (key: string, value: unknown) => db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
const [area] = await db.select().from(areas).where(eq(areas.active, true)).limit(1);

const made = { contacts: [] as number[], properties: [] as number[], requests: [] as number[], users: [] as number[] };
const contact = async (name: string, phone?: string) => {
  const [c] = await db.insert(contacts).values({ name: `${name} ${tag}`, phone: phone ?? null, source: "Test" }).returning();
  made.contacts.push(c.id);
  return c;
};
const property = async (values: Partial<typeof properties.$inferInsert>) => {
  const [p] = await db.insert(properties).values({ code: `TEST-${tag}-${made.properties.length}`, kind: KIND, purpose: "rent", status: "available",
    areaId: area.id, bedrooms: 2, ...values }).returning();
  made.properties.push(p.id);
  return p;
};
const request = async (values: Partial<typeof requests.$inferInsert> & { contactId: number }) => {
  const [r] = await db.insert(requests).values({ number: `TEST-${tag}-${made.requests.length}`, kind: "search", subtype: "Rent", ...values }).returning();
  made.requests.push(r.id);
  return r;
};

try {
  // ---- Owner dashboard ---------------------------------------------------------------------------------------------
  const owner = await contact("Owner", `+968${Date.now().toString().slice(-8)}`);
  const mine = await property({ rentPrice: 500, ownerPhone: owner.phone, public: true, verified: true });
  for (const price of [400, 450, 600]) await property({ rentPrice: price });
  const second = await property({ rentPrice: 300, purpose: "rent", kind: "Villa" });
  await request({ contactId: owner.id, kind: "listing", subtype: "Let", details: { review: { decision: "accepted", propertyId: second.id } } });
  const buyer = await contact("Buyer Secretname");
  const b1 = await request({ contactId: buyer.id, areaIds: [area.id], budgetMax: 550, propertyType: KIND, status: "working" });
  const buyer2 = await contact("Buyer Two");
  await request({ contactId: buyer2.id, areaIds: [area.id], budgetMax: 300, propertyType: KIND });
  await db.insert(matches).values({ requestId: b1.id, propertyId: mine.id, key: `test:${tag}`, score: 90, matchType: "within", status: "sent", sentAt: new Date() });
  await db.insert(savedProperties).values({ contactId: buyer.id, propertyId: mine.id });
  await db.insert(activities).values({ requestId: b1.id, contactId: buyer.id, type: "viewing", dueAt: new Date(Date.now() - 86_400_000), propertyId: mine.id,
    done: true, result: "interested" });
  await db.insert(offers).values({ requestId: b1.id, propertyId: mine.id, amount: 480 });
  await db.insert(propertyViews).values({ propertyId: mine.id, day: "2020-01-01", count: 5 });

  const dash = await ownerDashboard(owner.id);
  const d = dash.find((x) => x.property.id === mine.id);
  check("owner sees the property entered with their phone", !!d);
  check("owner sees the property from their accepted listing request", dash.some((x) => x.property.id === second.id));
  check("interest counts", d?.suggested === 1 && d.saved === 1 && d.viewings.done === 1 && d.viewings.results[0]?.result === "interested", JSON.stringify(d && { s: d.suggested, sv: d.saved, v: d.viewings }));
  check("offers: count and best", d?.offers.count === 1 && d.offers.best === 480);
  check("views: total vs last 30 days", d?.views === 5 && d.views30 === 0, `${d?.views}/${d?.views30}`);
  check("market median from 3 similar", d?.market?.median === 450 && d.market.count === 3, JSON.stringify(d?.market));
  check("buyers looking / within price", d?.demand.looking === 2 && d.demand.withinPrice === 1, JSON.stringify(d?.demand));
  check("no buyer names or contacts in the data", !JSON.stringify(dash).includes("Secretname"));
  const v = dash.find((x) => x.property.id === second.id);
  check("no market figure with fewer than 3 similar", v?.market === null);
  check("someone else sees nothing", (await ownerDashboard(buyer2.id)).length === 0);

  if (base) {
    const before = (await db.select().from(propertyViews).where(eq(propertyViews.propertyId, mine.id))).reduce((a, r) => a + r.count, 0);
    const post = (body: unknown, headers: Record<string, string> = {}) => fetch(`${base}/api/views`, { method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin", ...headers }, body: JSON.stringify(body) });
    check("view counted for a public listing", (await post({ code: mine.code })).status === 204);
    check("cross-site view refused", (await post({ code: mine.code }, { "Sec-Fetch-Site": "cross-site" })).status === 403);
    await post({ code: second.code }); // not public: ignored
    const after_ = (await db.select().from(propertyViews).where(eq(propertyViews.propertyId, mine.id))).reduce((a, r) => a + r.count, 0);
    const hidden = await db.select().from(propertyViews).where(eq(propertyViews.propertyId, second.id));
    check("exactly one view added; private listing not counted", after_ === before + 1 && hidden.length === 0, `${before}→${after_}`);
    const html = await (await fetch(base + portalLink(owner.id).replace(/^https?:\/\/[^/]+/, ""))).text();
    check("portal shows My properties", html.includes("My properties") && html.includes(mine.code) && html.includes("Median asking price"));
    check("portal shows no buyer name", !html.includes("Secretname"));
  }

  // ---- Fair auto-assignment ------------------------------------------------------------------------------------------
  const [agentA] = await db.insert(users).values({ name: `Agent A ${tag}`, email: `a-${tag}@test.invalid`, passwordHash: "x", role: "agent", apps: ["crm"],
    receivesRequests: true }).returning();
  const [agentB] = await db.insert(users).values({ name: `Agent B ${tag}`, email: `b-${tag}@test.invalid`, passwordHash: "x", role: "agent", apps: ["crm"],
    receivesRequests: true }).returning();
  made.users.push(agentA.id, agentB.id);
  const others = await db.select({ id: users.id }).from(users).where(and(eq(users.receivesRequests, true), eq(users.active, true)));
  if (others.length !== 2) {
    console.log("Other staff are already in the rotation; skipping the assignment checks so their work is not touched.");
  } else {
    const cust = await contact("Assign");
    await request({ contactId: cust.id, assignedTo: agentA.id, status: "working" }); // A already has one open request
    await setSetting("assignAuto", false);
    const off = await request({ contactId: cust.id });
    check("switched off: nobody assigned", (await autoAssign(off.id)) === null);
    await setSetting("assignAuto", true);
    const r1 = await request({ contactId: cust.id });
    check("goes to the person with fewer open requests", (await autoAssign(r1.id))?.id === agentB.id);
    const r2 = await request({ contactId: cust.id });
    check("tie → whoever waited longest", (await autoAssign(r2.id))?.id === agentA.id);
    check("already assigned is left alone", (await autoAssign(r2.id)) === null);
    const listing = await request({ contactId: cust.id, kind: "listing" });
    check("owner listings are not auto-assigned", (await autoAssign(listing.id)) === null);
    const [n] = await db.select().from(notifications).where(like(notifications.key, `request_assigned:${r1.id}:${agentB.id}:%`));
    check("assigned person notified", !!n);
    const [note] = await db.select().from(activities).where(and(eq(activities.requestId, r1.id), like(activities.body, "auto_assigned:%")));
    check("timeline note added", !!note);

    // Reassign after the set hours without a first reply, once only.
    await setSetting("reassignHours", 1);
    const old = await request({ contactId: cust.id, assignedTo: agentA.id, createdAt: new Date(Date.now() - 2 * 3_600_000) });
    const answered = await request({ contactId: cust.id, assignedTo: agentA.id, createdAt: new Date(Date.now() - 2 * 3_600_000), firstResponseAt: new Date() });
    await reassignOverdue();
    const [movedRow] = await db.select().from(requests).where(eq(requests.id, old.id));
    const [keptRow] = await db.select().from(requests).where(eq(requests.id, answered.id));
    check("no reply in time → moved to the other person", movedRow.assignedTo === agentB.id);
    check("answered request not moved", keptRow.assignedTo === agentA.id);
    await reassignOverdue();
    const [still] = await db.select().from(requests).where(eq(requests.id, old.id));
    check("moved only once", still.assignedTo === agentB.id);
    const [told] = await db.select().from(notifications).where(like(notifications.key, `request_reassigned:${old.id}:${agentA.id}%`));
    check("previous person told", !!told);
    await setSetting("assignRunAt", new Date().toISOString());
    check("throttled: no second run within 10 minutes", (await maybeRunAssignments()) === 0);
    await db.update(users).set({ receivesRequests: false }).where(eq(users.id, agentB.id));
    check("only people in the rotation", (await pickAgent())?.id === agentA.id);
  }

  // ---- Weekly report -------------------------------------------------------------------------------------------------
  const [manager] = await db.insert(users).values({ name: `Manager ${tag}`, email: `m-${tag}@test.invalid`, passwordHash: "x", role: "manager", apps: ["crm"] }).returning();
  made.users.push(manager.id);
  const report = await weeklyReport();
  const en = reportText(report, "en");
  const ar = reportText(report, "ar");
  check("weekly report has every section (en)", ["New requests", "First reply", "Viewings done", "Offers", "Income", "By person"].every((s) => en.body.includes(s)));
  check("weekly report in Arabic", ar.body.includes("طلبات جديدة") && ar.subject.includes("التقرير الأسبوعي"));
  check("not sent on a weekday", (await sendWeeklyReport(new Date("2025-01-06T06:00:00Z"))) === 0);
  await sendWeeklyReport(new Date("2025-01-05T06:00:00Z")); // a Sunday long ago: claims that week only
  const [claim] = await db.select().from(settings).where(eq(settings.key, "weeklyReportSent"));
  check("Sunday run claims the week", claim?.value === "2025-01-05");
  const [bell] = await db.select().from(notifications).where(like(notifications.key, "weekly_report:2025-01-05:%"));
  check("managers get a notification", !!bell);
  await sendWeeklyReport(new Date("2025-01-05T07:00:00Z"));
  const bells = await db.select().from(notifications).where(like(notifications.key, "weekly_report:2025-01-05:%"));
  const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.active, true), inArray(users.role, ["admin", "manager"])));
  check("sent once per week", bells.length === admins.length, `${bells.length} vs ${admins.length}`);
} finally {
  await db.delete(notifications).where(or(like(notifications.key, "weekly_report:2025-01-05:%"),
    ...(made.requests.length ? made.requests.flatMap((id) => [like(notifications.key, `request_assigned:${id}:%`), like(notifications.key, `request_reassigned:${id}:%`)]) : [])));
  if (made.requests.length) {
    await db.delete(auditLog).where(and(like(auditLog.action, "request_auto_%"), inArray(auditLog.entityId, made.requests.map(String))));
    await db.delete(activities).where(inArray(activities.requestId, made.requests));
    await db.delete(offers).where(inArray(offers.requestId, made.requests));
    await db.delete(matches).where(inArray(matches.requestId, made.requests));
    await db.delete(requests).where(inArray(requests.id, made.requests));
  }
  await db.delete(activities).where(inArray(activities.contactId, made.contacts.length ? made.contacts : [0]));
  await db.delete(savedProperties).where(inArray(savedProperties.contactId, made.contacts.length ? made.contacts : [0]));
  if (made.properties.length) await db.delete(properties).where(inArray(properties.id, made.properties));
  if (made.contacts.length) await db.delete(contacts).where(inArray(contacts.id, made.contacts));
  if (made.users.length) await db.delete(users).where(inArray(users.id, made.users));
  await db.delete(settings).where(inArray(settings.key, KEYS));
  if (savedSettings.length) await db.insert(settings).values(savedSettings);
}
const leftover = await db.select({ id: contacts.id }).from(contacts).where(like(contacts.name, `% ${tag}`));
check("test data removed and settings restored", leftover.length === 0);
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
