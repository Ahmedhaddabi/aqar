// Map extras (price badge, budget), calendar subscription, assignment by area, commission payouts, field photo upload.
// Test database only; everything made here is removed. Run: npm run test:extras [-- http://localhost:3000]
import "./test-guard.mts";

import { and, eq, inArray, like } from "drizzle-orm";

import { loanFor } from "@/components/Calculators";
import { priceBadge } from "@/components/map/MapExtras";
import { db } from "@/db";
import { activities, commissionPayouts, contacts, invoices, payments, requests, users } from "@/db/schema";
import { pickAgent } from "@/lib/assign";
import type { MapListing } from "@/lib/content";
import { calendarFor, calendarKey, toIcs } from "@/lib/ics";
import { currentMonth, monthRange, performance } from "@/lib/performance";

const base = process.argv[2];
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const tag = `T${Date.now().toString(36)}`;
const made = { users: [] as number[], contacts: [] as number[], requests: [] as number[], invoices: [] as number[] };

try {
  // ---- Price badge and budget ---------------------------------------------------------------------------------------
  const l = (id: string, rent: number, area = "1", kind = "Apartment"): MapListing => ({ id, type: "property", kind, title: null, area, purpose: "Rent",
    image: null, point: null, exact: false, rent_price: rent });
  const all = [l("a", 400), l("b", 500), l("c", 600), l("me", 450), l("x", 9999, "2"), l("v", 100, "1", "Villa")];
  const badge = priceBadge(all[3], all, "all");
  check("450 vs typical 500 → 10% below similar", badge?.pct === -10 && badge.tone === "low", JSON.stringify(badge));
  check("other areas and types are not compared", priceBadge(l("solo", 450, "9"), all, "all") === null);
  check("within ±5% reads 'typical'", priceBadge({ ...all[3], rent_price: 510 }, all, "all")?.tone === "typical");
  const maxSale = Math.round(loanFor(800, 5.5, 25) / 0.8);
  check("800 a month buys about 162,700 (25 years, 5.5%, 20% down)", Math.abs(maxSale - 162_700) < 300, String(maxSale));

  // ---- Calendar subscription ---------------------------------------------------------------------------------------
  const ics = toIcs("Test, cal", [{ uid: "u1", start: new Date("2026-11-08T06:00:00Z"), minutes: 60, title: "Viewing; Ahmed, Villa", description: "line1\nline2",
    url: "https://x/y" }]);
  check("calendar file: VEVENT with escaped text and UTC times", ics.includes("BEGIN:VEVENT") && ics.includes("SUMMARY:Viewing\\; Ahmed\\, Villa")
    && ics.includes("DTSTART:20261108T060000Z") && ics.includes("DTEND:20261108T070000Z") && ics.includes("DESCRIPTION:line1\\nline2") && ics.endsWith("\r\n"));
  const [agent] = await db.insert(users).values({ name: `Cal ${tag}`, email: `cal-${tag}@test.invalid`, passwordHash: "x", role: "agent", apps: ["crm"] }).returning();
  made.users.push(agent.id);
  const [c] = await db.insert(contacts).values({ name: `Cal Customer ${tag}`, phone: "+96890000009", source: "Test" }).returning();
  made.contacts.push(c.id);
  const [r] = await db.insert(requests).values({ number: `TEST-${tag}-1`, kind: "search", contactId: c.id, assignedTo: agent.id, status: "viewing" }).returning();
  made.requests.push(r.id);
  await db.insert(activities).values({ requestId: r.id, contactId: c.id, userId: agent.id, type: "viewing", dueAt: new Date(Date.now() + 86_400_000) });
  const key = await calendarKey(agent.id);
  const feed = await calendarFor(key);
  check("person's feed lists their viewing", !!feed && feed.includes(`Cal Customer ${tag}`) && feed.includes("X-WR-CALNAME:Aqar 360 · Cal"));
  const renewed = await calendarKey(agent.id, true);
  check("a new link revokes the old one", renewed !== key && (await calendarFor(key)) === null && !!(await calendarFor(renewed)));

  // ---- Assignment by area ------------------------------------------------------------------------------------------
  const others = await db.select({ id: users.id }).from(users).where(and(eq(users.receivesRequests, true), eq(users.active, true)));
  if (others.length) console.log("      skipped area assignment: people already in the rotation on the test database");
  else {
    const [a1] = await db.insert(users).values({ name: `Area A ${tag}`, email: `aa-${tag}@test.invalid`, passwordHash: "x", role: "agent", apps: ["crm"], receivesRequests: true, areaIds: [] }).returning();
    const [a2] = await db.insert(users).values({ name: `Area B ${tag}`, email: `ab-${tag}@test.invalid`, passwordHash: "x", role: "agent", apps: ["crm"], receivesRequests: true, areaIds: [77777] }).returning();
    made.users.push(a1.id, a2.id);
    // B already has more open work, but covers area 77777.
    const [busy] = await db.insert(requests).values({ number: `TEST-${tag}-2`, kind: "search", contactId: c.id, assignedTo: a2.id, status: "working" }).returning();
    made.requests.push(busy.id);
    check("request in a covered area → the person covering it", (await pickAgent([], [77777]))?.id === a2.id);
    check("area nobody covers → fewest open requests", (await pickAgent([], [88888]))?.id === a1.id);
  }

  // ---- Commission payouts ------------------------------------------------------------------------------------------
  await db.update(users).set({ commissionPct: 10 }).where(eq(users.id, agent.id));
  const month = currentMonth();
  const [inv] = await db.insert(invoices).values({ number: `TEST-${tag}-INV`, kind: "invoice", contactId: c.id, requestId: r.id, status: "paid",
    issueDate: monthRange(month).fromDay, total: 2000 }).returning();
  made.invoices.push(inv.id);
  await db.insert(payments).values({ invoiceId: inv.id, amount: 2000, method: "bank", paidOn: monthRange(month).fromDay });
  await db.insert(commissionPayouts).values({ userId: agent.id, month, amount: 150, paidOn: monthRange(month).fromDay });
  const [p] = await performance(month, agent.id);
  check("commission 200, paid 150 → 50 still due", p?.commission === 200 && p.paidOut === 150 && p.due === 50, JSON.stringify(p && { c: p.commission, p: p.paidOut, d: p.due }));

  if (base) {
    const photo = await fetch(`${base}/api/field/photo`, { method: "POST", headers: { "Sec-Fetch-Site": "same-origin" }, body: new FormData() });
    check("field photo upload needs a signed-in staff member", photo.status === 401);
    const feedRes = await fetch(`${base}/api/calendar/${renewed}.ics`);
    check("calendar link works over the web (text/calendar)", feedRes.ok && (feedRes.headers.get("content-type") ?? "").includes("text/calendar"));
  }
} finally {
  if (made.invoices.length) { await db.delete(payments).where(inArray(payments.invoiceId, made.invoices)); await db.delete(invoices).where(inArray(invoices.id, made.invoices)); }
  if (made.requests.length) { await db.delete(activities).where(inArray(activities.requestId, made.requests)); await db.delete(requests).where(inArray(requests.id, made.requests)); }
  if (made.contacts.length) await db.delete(contacts).where(inArray(contacts.id, made.contacts));
  if (made.users.length) await db.delete(users).where(inArray(users.id, made.users)); // payouts go with them
}
const left = await db.select({ id: users.id }).from(users).where(like(users.email, `%${tag}%`));
check("test data removed", left.length === 0);
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
