// Calculators, website chat (limits, lead path), reviews and referrals, online agreements — end to end against the
// database, with page checks when a site address is given. Temporary rows only; everything is removed at the end.
// Run: npm run test:release-a [-- http://localhost:3000]
import "./test-guard.mts";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";

import { loanFor, monthlyPayment } from "@/components/Calculators";
import { db } from "@/db";
import { activities, agreements, auditLog, chatUsage, contacts, notifications, outbox, properties, requests, reviews, serviceJobs, settings,
  users } from "@/db/schema";
import { createAgreement, declineAgreement, sendAgreement, signAgreement } from "@/lib/agreements";
import { chatAvailable, takeChatTurn } from "@/lib/chat";
import { agreementLink, reviewLink } from "@/lib/doc-link";
import { sha256, submitForm } from "@/lib/intake";
import { createJob, setJobStatus } from "@/lib/jobs";
import { askForReview, creditReferral, publicReviews, referralCode, referralStats, saveReview } from "@/lib/reviews";
import { muscatDay } from "@/lib/viewings";

const base = process.argv[2];
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const tag = `T${Date.now().toString(36)}`;
const made = { contacts: [] as number[], requests: [] as number[], properties: [] as number[], users: [] as number[], jobs: [] as number[], agreements: [] as number[] };
const day = muscatDay(new Date());
const [allBefore] = await db.select().from(chatUsage).where(and(eq(chatUsage.day, day), eq(chatUsage.key, "all")));
const savedChat = await db.select().from(settings).where(inArray(settings.key, ["chatEnabled", "chatDailyCap"]));
// Documentation-range addresses (RFC 5737): never a real visitor.
const testIps = [`203.0.113.${Date.now() % 250}`, `198.51.100.${Date.now() % 250}`];

try {
  // ---- Calculators ---------------------------------------------------------------------------------------------------
  const pay = monthlyPayment(96_000, 5.5, 25);
  check("mortgage payment (96,000 at 5.5% over 25 years ≈ 589.5)", Math.abs(pay - 589.53) < 0.5, pay.toFixed(2));
  check("affordability is the inverse", Math.abs(loanFor(pay, 5.5, 25) - 96_000) < 1);
  check("zero interest", monthlyPayment(12_000, 0, 1) === 1000 && loanFor(1000, 0, 1) === 12_000);
  check("nothing to borrow → 0", monthlyPayment(0, 5, 20) === 0);

  // ---- Website chat ---------------------------------------------------------------------------------------------------
  await db.delete(settings).where(eq(settings.key, "chatEnabled"));
  check("chat off by default", !(await chatAvailable()));
  const ip = testIps[0];
  const turns = [];
  for (let i = 0; i < 41; i++) turns.push(await takeChatTurn(ip, 100_000));
  check("40 messages per visitor per day, then stop", turns.slice(0, 40).every(Boolean) && turns[40] === false);
  const [allNow] = await db.select().from(chatUsage).where(and(eq(chatUsage.day, day), eq(chatUsage.key, "all")));
  check("daily total cap stops everyone", (await takeChatTurn(testIps[1], (allNow?.count ?? 0))) === false);
  const lead = await submitForm("search", { full_name: `Chat Lead ${tag}`, phone: "+96890000001", language: "en", source_channel: "Website chat",
    idempotency_key: `chat:${tag}:search`, purpose: "Rent", property_type: "Apartment", areas: [], budget_max: 500, timing: "Not Urgent",
    preferred_channel: "WhatsApp", notes: "from the chat test" }, ip, { viaChat: true });
  check("chat lead needs an area like the form", !lead.ok && !!lead.error.fields?.areas);
  const [area] = await db.execute(sql`select id from areas where active limit 1`) as unknown as { id: number }[];
  const lead2 = await submitForm("search", { full_name: `Chat Lead ${tag}`, phone: "+96890000001", language: "en", source_channel: "Website chat",
    idempotency_key: `chat:${tag}:search`, purpose: "Rent", property_type: "Apartment", areas: [String(area.id)], budget_max: 500, timing: "Not Urgent",
    preferred_channel: "WhatsApp", notes: "from the chat test" }, ip, { viaChat: true });
  const [chatReq] = lead2.ok ? await db.select().from(requests).where(eq(requests.number, lead2.data.request_number)) : [];
  if (chatReq) { made.requests.push(chatReq.id); made.contacts.push(chatReq.contactId); }
  check("chat lead becomes a CRM request (source Website chat)", chatReq?.sourceChannel === "Website chat" && chatReq.kind === "search");

  // ---- Reviews and referrals -----------------------------------------------------------------------------------------
  const [referrer] = await db.insert(contacts).values({ name: `Referrer ${tag}`, source: "Test" }).returning();
  const [friend] = await db.insert(contacts).values({ name: `Friend ${tag}`, source: "Test" }).returning();
  made.contacts.push(referrer.id, friend.id);
  const code = await referralCode(referrer.id);
  check("invite code made once and kept", /^[A-Z2-9]{6}$/.test(code) && (await referralCode(referrer.id)) === code);
  const [fr] = await db.insert(requests).values({ number: `TEST-${tag}-F`, kind: "search", contactId: friend.id }).returning();
  const [self] = await db.insert(requests).values({ number: `TEST-${tag}-S`, kind: "search", contactId: referrer.id }).returning();
  made.requests.push(fr.id, self.id);
  check("referred request credited", (await creditReferral(fr.id, { utm_campaign: `ref-${code}` }))?.id === referrer.id);
  check("own link does not count", (await creditReferral(self.id, { utm_campaign: `ref-${code}` })) === null);
  check("unknown code ignored", (await creditReferral(self.id, { utm_campaign: "ref-ZZZZZZ" })) === null);
  check("referral stats", (await referralStats(referrer.id)).total === 1);

  await askForReview(referrer.id, `request:${self.id}`, self.id);
  const [ask] = await db.select().from(outbox).where(eq(outbox.key, `review:${referrer.id}:request:${self.id}`));
  check("review request queued (no email → skipped, recorded)", ask?.templateKey === "review_request" && ask.reason === "no_email");
  const rv = await saveReview(referrer.id, `request:${self.id}`, { rating: 5, comment: `Great ${tag}`, publish: true });
  check("review saved", rv?.rating === 5);
  check("one review per deal", (await saveReview(referrer.id, `request:${self.id}`, { rating: 1, comment: "again", publish: true })) === null);
  check("not on the website until approved", !(await publicReviews(50)).some((r) => r.comment.includes(tag)));
  await db.update(reviews).set({ approved: true }).where(eq(reviews.id, rv!.id));
  const shown = (await publicReviews(50)).find((r) => r.comment.includes(tag));
  check("approved review shown with first name only", shown?.name === "Referrer");
  const [hiddenOne] = await db.insert(reviews).values({ contactId: friend.id, ref: `request:${fr.id}`, rating: 4, comment: `Private ${tag}`, publish: false, approved: true }).returning();
  check("customer's 'do not publish' wins over approval", !(await publicReviews(50)).some((r) => r.id === hiddenOne.id));

  const [staff] = await db.insert(users).values({ name: `Staff ${tag}`, email: `s-${tag}@test.invalid`, passwordHash: "x", role: "manager", apps: ["crm", "erp"] }).returning();
  made.users.push(staff.id);
  const job = await createJob({ contactId: friend.id, title: `Job ${tag}` });
  made.jobs.push(job.id);
  await setJobStatus(job.id, "completed", staff.id);
  const [jobAsk] = await db.select().from(outbox).where(eq(outbox.key, `review:${friend.id}:job:${job.id}`));
  check("completed job asks for a review", !!jobAsk);

  // ---- Agreements -----------------------------------------------------------------------------------------------------
  const [prop] = await db.insert(properties).values({ code: `TEST-${tag}`, kind: "Villa", purpose: "sale", salePrice: 210000, status: "available" }).returning();
  made.properties.push(prop.id);
  const ag = await createAgreement({ contactId: friend.id, propertyId: prop.id, template: "marketing_exclusive", userId: staff.id });
  made.agreements.push(ag!.id);
  check("agreement filled from the records", !!ag && ag.body.includes(`Friend ${tag}`) && ag.body.includes(prop.code) && ag.body.includes("210000") && ag.status === "draft");
  check("number format", /^AGR-\d{4}-\d{5}$/.test(ag!.number));
  check("draft cannot be signed", !(await signAgreement(ag!.id, { name: "Friend Test", signature: `data:image/png;base64,${"A".repeat(800)}`, ipHash: null, agent: "test" })).ok);
  await sendAgreement(ag!.id, staff.id);
  const [sent] = await db.select().from(agreements).where(eq(agreements.id, ag!.id));
  check("sending fixes the text (hash)", sent.status === "sent" && /^[a-f0-9]{64}$/.test(sent.bodyHash ?? ""));
  const [mail] = await db.select().from(outbox).where(and(eq(outbox.contactId, friend.id), eq(outbox.templateKey, "agreement_sent")));
  check("customer link queued", !!mail && mail.body.includes(`/doc/agreement/${ag!.id}`));
  check("missing signature refused", (await signAgreement(ag!.id, { name: "Friend Test", signature: "", ipHash: null, agent: "t" })).reason === "signature");
  check("missing name refused", (await signAgreement(ag!.id, { name: "F", signature: `data:image/png;base64,${"A".repeat(800)}`, ipHash: null, agent: "t" })).reason === "name");
  if (base) {
    const page = await fetch(base + agreementLink(ag!.id).replace(/^https?:\/\/[^/]+/, ""));
    const html = await page.text();
    check("customer page shows the text and the sign form", page.status === 200 && html.includes(prop.code) && html.includes("Sign the agreement"));
    check("forged agreement link refused", (await fetch(`${base}/doc/agreement/${ag!.id}?s=forged`)).status === 404);
  }
  const ok = await signAgreement(ag!.id, { name: "  Friend   Test ", signature: `data:image/png;base64,${"A".repeat(800)}`, ipHash: "abc", agent: "test-agent" });
  const [signed] = await db.select().from(agreements).where(eq(agreements.id, ag!.id));
  check("signed with name, time, device", ok.ok && signed.status === "signed" && signed.signerName === "Friend Test" && !!signed.signedAt && signed.signerAgent === "test-agent");
  check("cannot be signed twice", !(await signAgreement(ag!.id, { name: "Someone", signature: `data:image/png;base64,${"B".repeat(800)}`, ipHash: null, agent: "t" })).ok);
  const [n] = await db.select().from(notifications).where(like(notifications.key, `agreement_signed:${ag!.id}:%`));
  check("staff told it was signed", !!n);

  const ag2 = await createAgreement({ contactId: friend.id, propertyId: prop.id, template: "reservation", userId: staff.id });
  made.agreements.push(ag2!.id);
  await sendAgreement(ag2!.id, staff.id);
  await db.update(agreements).set({ body: `${ag2!.body}\nchanged` }).where(eq(agreements.id, ag2!.id));
  check("text changed after sending → cannot be signed", (await signAgreement(ag2!.id, { name: "Friend Test", signature: `data:image/png;base64,${"A".repeat(800)}`, ipHash: null, agent: "t" })).reason === "state");
  const ag3 = await createAgreement({ contactId: friend.id, template: "blank", userId: staff.id });
  made.agreements.push(ag3!.id);
  check("empty text cannot be sent", !(await sendAgreement(ag3!.id, staff.id)));
  const ag4 = await createAgreement({ contactId: friend.id, template: "marketing_open", userId: staff.id });
  made.agreements.push(ag4!.id);
  await sendAgreement(ag4!.id, staff.id);
  check("decline", await declineAgreement(ag4!.id, "Not now"));

  // ---- Pages ----------------------------------------------------------------------------------------------------------
  if (base) {
    check("calculators page", (await fetch(`${base}/en/calculators`)).status === 200 && (await (await fetch(`${base}/ar/calculators`)).text()).includes("حاسبات العقار"));
    const r = await fetch(`${base}/r/${code}`, { redirect: "manual", headers: { "accept-language": "en" } });
    check("invite link opens the search form with the code", r.status === 307 && (r.headers.get("location") ?? "").includes(`utm_campaign=ref-${code}`));
    const bad = await fetch(`${base}/r/NOPE99`, { redirect: "manual" });
    check("unknown invite code: plain search form", bad.status === 307 && !(bad.headers.get("location") ?? "").includes("utm_"));
    const rl = reviewLink(friend.id, `job:${job.id}`).replace(/^https?:\/\/[^/]+/, "");
    const rp = await fetch(base + rl);
    check("review page shows the rating form", rp.status === 200 && (await rp.text()).includes("How did we do?"));
    const chat = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ sessionId: `test${tag}`, lang: "en", messages: [{ role: "user", content: "hi" }] }) });
    check("chat API closed while switched off", chat.status === 404);
    const xs = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" }, body: "{}" });
    check("chat API refuses other websites", xs.status === 403);
  }
} finally {
  const ids = made.contacts;
  await db.delete(notifications).where(or(...made.agreements.map((id) => like(notifications.key, `agreement_%:${id}:%`)),
    like(notifications.title, `%${tag}%`), ...made.requests.map((id) => like(notifications.key, `request_%:${id}:%`))));
  if (made.agreements.length) await db.delete(agreements).where(inArray(agreements.id, made.agreements));
  if (made.jobs.length) {
    await db.execute(sql`delete from job_events where job_id in (${sql.join(made.jobs.map((j) => sql`${j}`), sql`, `)})`);
    await db.delete(serviceJobs).where(inArray(serviceJobs.id, made.jobs));
  }
  if (ids.length) {
    await db.delete(outbox).where(inArray(outbox.contactId, ids));
    await db.delete(reviews).where(inArray(reviews.contactId, ids));
    await db.delete(activities).where(inArray(activities.contactId, ids));
    await db.execute(sql`delete from consents where contact_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
    await db.execute(sql`delete from matches where request_id in (select id from requests where contact_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}))`);
    await db.update(requests).set({ referredBy: null }).where(inArray(requests.referredBy, ids));
    await db.delete(requests).where(inArray(requests.contactId, ids));
  }
  await db.delete(auditLog).where(or(and(like(auditLog.action, "agreement_%"), inArray(auditLog.entityId, made.agreements.map(String))),
    and(eq(auditLog.action, "form_submitted"), inArray(auditLog.entityId, made.requests.map(String)))));
  if (made.properties.length) await db.delete(properties).where(inArray(properties.id, made.properties));
  if (ids.length) await db.delete(contacts).where(inArray(contacts.id, ids));
  if (made.users.length) { await db.delete(notifications).where(inArray(notifications.userId, made.users)); await db.delete(users).where(inArray(users.id, made.users)); }
  // Chat counters: remove the test visitors and put today's total back.
  await db.delete(chatUsage).where(and(eq(chatUsage.day, day), inArray(chatUsage.key, testIps.map((t) => `ip:${sha256(`aqar:${t}`)}`))));
  if (allBefore) await db.update(chatUsage).set({ count: allBefore.count }).where(and(eq(chatUsage.day, day), eq(chatUsage.key, "all")));
  else await db.delete(chatUsage).where(and(eq(chatUsage.day, day), eq(chatUsage.key, "all")));
  await db.delete(settings).where(inArray(settings.key, ["chatEnabled", "chatDailyCap"]));
  if (savedChat.length) await db.insert(settings).values(savedChat);
}
const left = await db.select({ id: contacts.id }).from(contacts).where(like(contacts.name, `% ${tag}`));
check("test data removed", left.length === 0);
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
