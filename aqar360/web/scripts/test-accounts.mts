// Customer accounts end to end on the TEST database, through the real pages and forms of a local site: create account,
// duplicates, log in / lockout, email code linking, log out, forgot password, private link linking, request linking.
// Run with a local site that uses the test database: npm run test:accounts -- http://localhost:3000
import "./test-guard.mts";

import { createHash } from "node:crypto";

import { eq, inArray, like, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { activities, auditLog, contacts, customerAccounts, customerCodes, outbox, requests } from "@/db/schema";
import { linkAccount } from "@/lib/customer-auth";
import { portalParams } from "@/lib/doc-link";

const base = process.argv[2];
if (!base) { console.error("Give the local site address, e.g. http://localhost:3000"); process.exit(2); }
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const tag = `t${Date.now().toString(36)}`;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const emailA = `acct-a-${tag}@test.invalid`;
const emailC = `acct-c-${tag}@test.invalid`;
const phoneB = `+9689${Date.now().toString().slice(-7)}`;
const phoneC = `+9687${Date.now().toString().slice(-7)}`;

/** A browser in miniature: keeps cookies, opens a page and submits the form on it that contains `marker`. */
class Visitor {
  jar = new Map<string, string>();
  get cookie() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  keep(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const [k, v] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
      const gone = !v || attrs.some((a) => /expires=Thu, 01 Jan 1970/i.test(a) || /max-age=0/i.test(a.trim()));
      if (gone) this.jar.delete(k.trim()); else this.jar.set(k.trim(), v);
    }
  }
  async open(path: string) {
    const res = await fetch(base + path, { headers: { cookie: this.cookie }, redirect: "manual" });
    this.keep(res);
    return { status: res.status, location: res.headers.get("location") ?? "", html: res.status === 200 ? await res.text() : "" };
  }
  async submit(path: string, marker: string, fields: Record<string, string>) {
    const page = await this.open(path);
    const form = [...page.html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes(marker));
    if (!form) return { status: 0, location: `no form with ${marker} on ${path} (${page.status} ${page.location})` };
    const body = new FormData();
    for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
      const name = /name="([^"]+)"/.exec(m[0])?.[1];
      if (name) body.append(name, /value="([^"]*)"/.exec(m[0])?.[1]?.replace(/&amp;/g, "&") ?? "");
    }
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    const res = await fetch(base + path, { method: "POST", body, headers: { cookie: this.cookie, origin: base }, redirect: "manual" });
    this.keep(res);
    return { status: res.status, location: res.headers.get("location") ?? "" };
  }
}
const accountBy = async (where: ReturnType<typeof eq>) => (await db.select().from(customerAccounts).where(where))[0];
const knownCode = async (accountId: number, purpose: "verify_email" | "reset_password") => {
  await db.insert(customerCodes).values({ accountId, purpose, codeHash: sha256(`${process.env.AUTH_SECRET ?? ""}:${purpose}:${accountId}:246810`),
    expiresAt: new Date(Date.now() + 600_000) });
  return "246 810";
};
const madeContacts: number[] = [];

try {
  // ---- create account, duplicate, pages --------------------------------------------------------------------------
  const a = new Visitor();
  const signup = await a.submit("/en/account/login?mode=signup", 'name="name"', { name: `Account A ${tag}`, identifier: emailA.toUpperCase(),
    password: "long-enough-1", keep: "on" });
  // Email is not connected on the test database, so the code cannot go out: the page must say so.
  check("create account with an email → My account, saying the email did not go", signup.location.endsWith("/en/account?done=welcome&error=mail#connect"), signup.location);
  check("signed in: secret cookie and the header hint", a.jar.has("aqar_customer") && a.jar.get("aqar_signed_in") === "1");
  const accA = await accountBy(eq(customerAccounts.email, emailA));
  check("email saved in lower case, password hashed", !!accA && accA.passwordHash.startsWith("$2"));
  const dup = await new Visitor().submit("/en/account/login?mode=signup", 'name="name"', { name: "Someone", identifier: emailA, password: "another-pass-2" });
  check("same email again is refused", dup.location.includes("error=taken"), dup.location);
  const short = await new Visitor().submit("/ar/account/login?mode=signup", 'name="name"', { name: "Short", identifier: phoneB, password: "short" });
  check("short password is refused", short.location.includes("error=password"), short.location);
  const page = await a.open("/en/account");
  check("My account page loads, not linked yet", page.status === 200 && page.html.includes("Connect your requests"));
  const noMail = await a.submit("/en/account", "Send a new code", {});
  check("a new code that cannot be sent is reported, not claimed as sent", noMail.location.endsWith("/en/account?error=mail#connect"), noMail.location);
  const noMailPage = await a.open("/en/account?error=mail");
  check("the customer sees why", noMailPage.html.includes("We could not send the email") && !noMailPage.html.includes("We sent a code"));
  const unsent = await db.select().from(customerCodes).where(eq(customerCodes.accountId, accA.id));
  check("codes that were not sent are not kept (and do not use up the limit)", unsent.length === 0, `${unsent.length} left`);
  for (let i = 0; i < 3; i++) await knownCode(accA.id, "verify_email");
  const tooMany = await a.submit("/en/account", "Send a new code", {});
  check("too many codes in an hour is reported", tooMany.location.endsWith("/en/account?error=limit#connect"), tooMany.location);
  await db.delete(customerCodes).where(eq(customerCodes.accountId, accA.id));
  check("login page sends a signed-in visitor to My account", (await a.open("/en/account/login")).location.endsWith("/en/account"));
  check("My account without a login goes to the login page", (await new Visitor().open("/ar/account")).location.endsWith("/ar/account/login"));
  const ar = await new Visitor().open("/ar/account/login");
  check("Arabic login page loads", ar.status === 200 && ar.html.includes("المتابعة كزائر"));

  // ---- email code links the account to the customer record --------------------------------------------------------
  const [old] = await db.insert(contacts).values({ name: `Old Customer ${tag}`, email: emailA, source: "Test" }).returning();
  madeContacts.push(old.id);
  const bad = await a.submit("/en/account", 'name="code"', { code: "000000" });
  check("wrong email code is refused", bad.location.includes("error=code"), bad.location);
  const code = await knownCode(accA.id, "verify_email");
  const good = await a.submit("/en/account", 'name="code"', { code });
  const linkedA = await accountBy(eq(customerAccounts.id, accA.id));
  check("right code: email confirmed and linked to the customer with that email",
    good.location.includes("done=verified") && linkedA.contactId === old.id && linkedA.linkedVia === "email_code" && !!linkedA.emailVerifiedAt, good.location);
  const dash = await a.open("/en/account");
  check("My account shows the customer dashboard", dash.status === 200 && !dash.html.includes("Connect your requests") && dash.html.includes("cust"));

  // ---- log out, lockout, log in ----------------------------------------------------------------------------------
  const out = await a.submit("/en/account", "Log out", {});
  check("log out ends the session", out.location.endsWith("/en/account/login") && !a.jar.has("aqar_customer")
    && (await a.open("/en/account")).location.endsWith("/en/account/login"), out.location);
  const b = new Visitor();
  await b.submit("/en/account/login?mode=signup", 'name="name"', { name: `Account B ${tag}`, identifier: phoneB.replace("+968", ""), password: "phone-pass-1" });
  const accB = await accountBy(eq(customerAccounts.phone, phoneB));
  check("create account with a mobile number (normalised +968)", !!accB && b.jar.has("aqar_customer"));
  const tries = [];
  for (let i = 0; i < 6; i++) tries.push((await new Visitor().submit("/en/account/login", 'name="password"', { identifier: phoneB, password: `wrong-${i}` })).location);
  check("5 wrong passwords, then locked", tries.slice(0, 5).every((l) => l.includes("error=wrong")) && tries[5].includes("error=locked"), tries.join(" "));
  const lockedRight = await new Visitor().submit("/en/account/login", 'name="password"', { identifier: phoneB, password: "phone-pass-1" });
  check("locked even with the right password", lockedRight.location.includes("error=locked"));
  const unknown = await new Visitor().submit("/en/account/login", 'name="password"', { identifier: `nobody-${tag}@test.invalid`, password: "whatever-1" });
  check("unknown account: same answer as a wrong password", unknown.location.includes("error=wrong"));
  const back = new Visitor();
  const login = await back.submit("/en/account/login", 'name="password"', { identifier: emailA, password: "long-enough-1", keep: "on" });
  check("log in with email and password", login.location.endsWith("/en/account") && back.jar.has("aqar_customer"), login.location);

  // ---- forgot password ---------------------------------------------------------------------------------------------
  const r = new Visitor();
  const asked = await r.submit("/en/account/forgot", 'name="identifier"', { identifier: emailA });
  check("forgot password asks for the code", asked.location.endsWith("/en/account/forgot?step=code"), asked.location);
  const asked2 = await new Visitor().submit("/en/account/forgot", 'name="identifier"', { identifier: `nobody-${tag}@test.invalid` });
  check("unknown email: same answer", asked2.location === asked.location);
  const resetCode = await knownCode(accA.id, "reset_password");
  const reset = await r.submit("/en/account/forgot?step=code", 'name="code"', { code: resetCode, password: "brand-new-pass-3" });
  check("new password set with the code", reset.location.includes("done=reset") && r.jar.has("aqar_customer"), reset.location);
  check("old logins end after a reset", (await back.open("/en/account")).location.endsWith("/en/account/login"));
  const newLogin = await new Visitor().submit("/en/account/login", 'name="password"', { identifier: emailA, password: "brand-new-pass-3" });
  check("log in with the new password", newLogin.location.endsWith("/en/account"));

  // ---- private link: a signed-in customer adds the record to the account ------------------------------------------
  const [x] = await db.insert(contacts).values({ name: `Link Customer ${tag}`, phone: phoneB, source: "Test" }).returning();
  madeContacts.push(x.id);
  const p = portalParams(x.id);
  const portalPath = `/portal/home?c=${p.c}&e=${p.e}&s=${encodeURIComponent(p.s)}`;
  const portal = await b.open(portalPath);
  check("private link offers \"Add to my account\" when logged in", portal.status === 200 && portal.html.includes("Add to my account"));
  check("…but not to a visitor without an account", !(await new Visitor().open(portalPath)).html.includes("Add to my account"));
  const added = await b.submit(portalPath, "Add to my account", {});
  check("added: back to My account", /\/(ar|en)\/account\?done=linked/.test(added.location), added.location);
  check("account linked by private link", (await accountBy(eq(customerAccounts.id, accB.id))).contactId === x.id);
  check("a record linked to one account is never moved to another", (await linkAccount(accA.id, x.id, "staff")) === false);

  // ---- a new request in the account's own details links the new record -------------------------------------------
  const c = new Visitor();
  await c.submit("/en/account/login?mode=signup", 'name="name"', { name: `Account C ${tag}`, identifier: emailC, password: "third-pass-1" });
  const [area] = await db.execute(sql`select id from areas where active limit 1`) as unknown as { id: number }[];
  const form = await fetch(`${base}/api/forms/search`, { method: "POST", headers: { "Content-Type": "application/json", origin: base, cookie: c.cookie },
    body: JSON.stringify({ full_name: `Account C ${tag}`, phone: phoneC, email: emailC, language: "en", idempotency_key: `acct:${tag}:c`, purpose: "Rent",
      property_type: "Apartment", areas: [String(area.id)], budget_max: 500, timing: "Not Urgent", preferred_channel: "Phone" }) });
  const sent = await form.json() as { ok: boolean; data?: Record<string, unknown> };
  const accC = await accountBy(eq(customerAccounts.email, emailC));
  if (accC?.contactId) madeContacts.push(accC.contactId);
  check("request sent while logged in → new record linked to the account", form.status === 200 && sent.ok && accC?.linkedVia === "new_request");
  check("the form answer does not show the record id", !!sent.data && !("contact" in sent.data) && !JSON.stringify(sent).includes("returning"));
  const [reqC] = accC?.contactId ? await db.select().from(requests).where(eq(requests.contactId, accC.contactId)) : [];
  const dashC = await c.open("/en/account");
  check("the new request shows in My account", !!reqC && dashC.html.includes(reqC.number));
} finally {
  const accounts = (await db.select({ id: customerAccounts.id, contactId: customerAccounts.contactId }).from(customerAccounts)
    .where(or(like(customerAccounts.email, `%${tag}%`), like(customerAccounts.name, `%${tag}%`))));
  for (const acc of accounts) if (acc.contactId && !madeContacts.includes(acc.contactId)) madeContacts.push(acc.contactId);
  const ids = accounts.map((x) => x.id);
  if (ids.length) {
    await db.delete(auditLog).where(or(inArray(auditLog.entityId, ids.map(String)), sql`(${auditLog.data}->>'account')::int in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`));
    await db.delete(customerAccounts).where(inArray(customerAccounts.id, ids)); // sessions and codes go with the account
  }
  await db.delete(auditLog).where(eq(auditLog.action, "customer_login_failed")); // only this test makes these on the test database
  if (madeContacts.length) {
    const reqIds = (await db.select({ id: requests.id }).from(requests).where(inArray(requests.contactId, madeContacts))).map((x) => x.id);
    await db.delete(outbox).where(inArray(outbox.contactId, madeContacts));
    await db.delete(activities).where(inArray(activities.contactId, madeContacts));
    await db.execute(sql`delete from consents where contact_id in (${sql.join(madeContacts.map((i) => sql`${i}`), sql`, `)})`);
    if (reqIds.length) {
      await db.execute(sql`delete from matches where request_id in (${sql.join(reqIds.map((i) => sql`${i}`), sql`, `)})`);
      await db.execute(sql`delete from notifications where key like any (array[${sql.join(reqIds.map((i) => sql`${`%:${i}%`}`), sql`, `)}])`);
      await db.delete(auditLog).where(inArray(auditLog.entityId, reqIds.map(String)));
      await db.delete(requests).where(inArray(requests.id, reqIds));
    }
    await db.delete(auditLog).where(inArray(auditLog.entityId, madeContacts.map(String)));
    await db.delete(contacts).where(inArray(contacts.id, madeContacts));
  }
}
const left = await db.select({ id: customerAccounts.id }).from(customerAccounts).where(like(customerAccounts.name, `%${tag}%`));
check("test accounts and records removed", left.length === 0);
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
