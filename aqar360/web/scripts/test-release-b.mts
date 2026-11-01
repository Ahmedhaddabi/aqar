// ID fields, commission and targets, marketing kit data, offline field sync — end to end against the database, with
// page checks when a site address is given. Temporary rows only; everything is removed at the end.
// Run: npm run test:release-b [-- http://localhost:3000]
import { and, eq, inArray, like } from "drizzle-orm";

import { db } from "@/db";
import { activities, auditLog, contacts, invoices, payments, properties, requests, targets, users } from "@/db/schema";
import { IdFields } from "@/lib/ai";
import type { CurrentUser } from "@/lib/auth";
import { applyFieldOp, FieldOp } from "@/lib/field-sync";
import { listingCard, listingFacts } from "@/lib/marketing";
import { currentMonth, monthRange, performance } from "@/lib/performance";

const base = process.argv[2];
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const tag = `T${Date.now().toString(36)}`;
const made = { users: [] as number[], contacts: [] as number[], requests: [] as number[], properties: [] as number[], invoices: [] as number[], ops: [] as string[] };
const asUser = (u: typeof users.$inferSelect): CurrentUser => ({ id: u.id, name: u.name, email: u.email, role: u.role, language: u.language, apps: u.apps, mfaEnabled: false });

try {
  // ---- ID document fields ------------------------------------------------------------------------------------------
  check("ID reader output shape is validated", IdFields.safeParse({ documentType: "civil_id", fullName: "Ahmed Test", idNumber: "12345678",
    nationality: "Oman", dateOfBirth: null, expiryDate: "2030-01-31" }).success && !IdFields.safeParse({ documentType: "selfie" }).success);
  const [withId] = await db.insert(contacts).values({ name: `ID Person ${tag}`, idNumber: "12345678", nationality: "Oman", idExpiry: "2030-01-31", source: "Test" }).returning();
  made.contacts.push(withId.id);
  check("ID number, nationality and expiry saved on the customer", withId.idNumber === "12345678" && withId.idExpiry === "2030-01-31");

  // ---- Commission and targets --------------------------------------------------------------------------------------
  const [agent] = await db.insert(users).values({ name: `Agent ${tag}`, email: `ag-${tag}@test.invalid`, passwordHash: "x", role: "agent", apps: ["crm"], commissionPct: 10 }).returning();
  const [other] = await db.insert(users).values({ name: `Other ${tag}`, email: `ot-${tag}@test.invalid`, passwordHash: "x", role: "agent", apps: ["crm"] }).returning();
  made.users.push(agent.id, other.id);
  const [cust] = await db.insert(contacts).values({ name: `Buyer ${tag}`, source: "Test" }).returning();
  made.contacts.push(cust.id);
  const [deal] = await db.insert(requests).values({ number: `TEST-${tag}-1`, kind: "search", contactId: cust.id, assignedTo: agent.id, status: "won" }).returning();
  const [open] = await db.insert(requests).values({ number: `TEST-${tag}-2`, kind: "search", contactId: cust.id, assignedTo: agent.id, status: "viewing" }).returning();
  const [theirs] = await db.insert(requests).values({ number: `TEST-${tag}-3`, kind: "search", contactId: cust.id, assignedTo: other.id, status: "viewing" }).returning();
  made.requests.push(deal.id, open.id, theirs.id);
  const month = currentMonth();
  const { fromDay } = monthRange(month);
  const [inv] = await db.insert(invoices).values({ number: `TEST-${tag}-INV`, kind: "invoice", contactId: cust.id, requestId: deal.id, status: "paid",
    issueDate: fromDay, total: 1000, passThroughTotal: 200 }).returning();
  made.invoices.push(inv.id);
  const lastMonth = new Date(Date.parse(`${fromDay}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  await db.insert(payments).values([{ invoiceId: inv.id, amount: 1000, method: "bank", paidOn: fromDay }, { invoiceId: inv.id, amount: 500, method: "bank", paidOn: lastMonth }]);
  await db.insert(activities).values({ requestId: open.id, contactId: cust.id, userId: agent.id, type: "viewing", dueAt: new Date(), done: true, result: "interested" });
  await db.insert(targets).values({ userId: agent.id, month, won: 2, viewings: 4, income: 1600 });
  const [me] = await performance(month, agent.id);
  check("deals won counted", me?.won === 1);
  check("viewings counted", me?.viewings === 1);
  check("income = our share only (media money excluded), this month only", me?.income === 800, String(me?.income));
  check("commission = income × %", me?.commission === 80, String(me?.commission));
  check("targets read for the month", me?.target.won === 2 && me.target.viewings === 4 && me.target.income === 1600);
  const all = await performance(month);
  check("ranking puts the earner first among these two", all.findIndex((r) => r.id === agent.id) < all.findIndex((r) => r.id === other.id));
  check("month range is Muscat time", monthRange("2026-11").from.toISOString() === "2026-10-31T20:00:00.000Z");

  // ---- Marketing kit -----------------------------------------------------------------------------------------------
  const [prop] = await db.insert(properties).values({ code: `TEST-${tag}`, kind: "Apartment", purpose: "rent", rentPrice: 450, bedrooms: 2,
    status: "available", ownerName: "Secret Owner", ownerPhone: "+96899999999", public: false, verified: false }).returning();
  made.properties.push(prop.id);
  const card = await listingCard(prop.id);
  const facts = await listingFacts(prop.id);
  check("card data: rent price and listing link", card?.rent === true && card.price === 450 && card.link.includes(prop.code));
  check("AI facts never include the owner", !!facts && !JSON.stringify(facts).includes("Secret Owner") && !JSON.stringify(facts).includes("99999999"));
  check("no public link in the AI facts while the listing is private", facts?.link === null && card?.isPublic === false);

  // ---- Offline field sync ------------------------------------------------------------------------------------------
  const [viewing] = await db.insert(activities).values({ requestId: open.id, contactId: cust.id, userId: agent.id, type: "viewing", dueAt: new Date(),
    propertyId: prop.id }).returning();
  const [foreign] = await db.insert(activities).values({ requestId: theirs.id, contactId: cust.id, userId: other.id, type: "viewing", dueAt: new Date() }).returning();
  const id = (n: string) => { const v = `t${tag}${n}`.replace(/[^A-Za-z0-9_-]/g, ""); made.ops.push(v); return v; };
  const me_ = asUser(agent);
  const checkin = FieldOp.parse({ id: id("a"), type: "checkin", activityId: viewing.id, at: new Date().toISOString(), lat: 23.6, lng: 58.2, accuracy: 12 });
  check("check-in applied", (await applyFieldOp(me_, checkin)) === "done");
  check("same check-in sent again: applied once", (await applyFieldOp(me_, checkin)) === "done");
  const notes = await db.select().from(activities).where(and(eq(activities.requestId, open.id), like(activities.body, "📍 check-in%")));
  check("one check-in note with the map link", notes.length === 1 && notes[0].body.includes("maps.google.com/?q=23.600000,58.200000"));
  const late = FieldOp.parse({ id: id("b"), type: "note", activityId: viewing.id, at: new Date(Date.now() - 3_600_000).toISOString(), text: "Customer liked the kitchen" });
  await applyFieldOp(me_, late);
  const [noteRow] = await db.select().from(activities).where(and(eq(activities.requestId, open.id), like(activities.body, "Customer liked the kitchen%")));
  check("note recorded offline keeps its time (sent later)", !!noteRow && noteRow.body.includes("sent later"));
  await applyFieldOp(me_, FieldOp.parse({ id: id("c"), type: "result", activityId: viewing.id, at: new Date().toISOString(), result: "interested" }));
  const [after] = await db.select().from(activities).where(eq(activities.id, viewing.id));
  const [req2] = await db.select().from(requests).where(eq(requests.id, open.id));
  check("viewing result saved; request moves to Offer", after.result === "interested" && after.done && req2.status === "offer");
  await applyFieldOp(me_, FieldOp.parse({ id: id("d"), type: "result", activityId: viewing.id, at: new Date().toISOString(), result: "no_show" }));
  const [kept] = await db.select().from(activities).where(eq(activities.id, viewing.id));
  check("a later result does not overwrite the first", kept.result === "interested");
  check("someone else's viewing refused", (await applyFieldOp(me_, FieldOp.parse({ id: id("e"), type: "checkin", activityId: foreign.id, at: new Date().toISOString() }))) === "denied");
  check("bad action shapes rejected", !FieldOp.safeParse({ id: "x", type: "checkin", activityId: 1, at: "now" }).success);

  if (base) {
    const sw = await fetch(`${base}/field-sw.js`);
    check("service worker served as JavaScript", sw.ok && (sw.headers.get("content-type") ?? "").includes("javascript"));
    const sync = await fetch(`${base}/api/field/sync`, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ ops: [checkin] }) });
    check("sync needs a signed-in staff member", sync.status === 401);
    const photo = await fetch(`${base}/admin/properties/${prop.id}/photo`, { redirect: "manual" });
    check("card photo needs sign-in", photo.status === 401);
    const perf = await fetch(`${base}/admin/performance`, { redirect: "manual" });
    check("performance page needs sign-in", perf.status === 307 && (perf.headers.get("location") ?? "").includes("/admin/login"));
  }
} finally {
  if (made.ops.length) await db.delete(auditLog).where(and(eq(auditLog.action, "field_op"), inArray(auditLog.entityId, made.ops)));
  if (made.requests.length) await db.delete(activities).where(inArray(activities.requestId, made.requests));
  if (made.invoices.length) { await db.delete(payments).where(inArray(payments.invoiceId, made.invoices)); await db.delete(invoices).where(inArray(invoices.id, made.invoices)); }
  if (made.requests.length) await db.delete(requests).where(inArray(requests.id, made.requests));
  if (made.properties.length) await db.delete(properties).where(inArray(properties.id, made.properties));
  if (made.contacts.length) await db.delete(contacts).where(inArray(contacts.id, made.contacts));
  if (made.users.length) await db.delete(users).where(inArray(users.id, made.users));
}
const left = await db.select({ id: contacts.id }).from(contacts).where(like(contacts.name, `% ${tag}`));
check("test data removed", left.length === 0);
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
