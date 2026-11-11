// Customer accounts on the website: create an account with a mobile number or an email and a password, log in, keep
// me logged in, forgot password. An account sees a customer record only after ownership is proven (emailed code,
// a private link we sent, staff, or a request made in a new name) — anyone can type someone else's number.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import bcrypt from "bcryptjs";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";

import { db } from "@/db";
import { auditLog, contacts, customerAccounts, customerCodes, customerSessions } from "@/db/schema";

import { DUMMY_HASH } from "./auth";
import { normalizePhone } from "./intake";
import { sendStaffEmail } from "./messages";

export const CUSTOMER_COOKIE = "aqar_customer";
export const SIGNED_IN_HINT = "aqar_signed_in"; // not secret: only switches "Log in" / "My account" on cached pages
const KEEP_DAYS = 30;
const SHORT_HOURS = 12;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const codeHash = (accountId: number, purpose: string, code: string) => sha256(`${process.env.AUTH_SECRET ?? ""}:${purpose}:${accountId}:${code}`);

export type Identifier = { email: string } | { phone: string };

/** "9XXXXXXX", "+968 9XXX XXXX" or "you@example.com" → a normalised email or phone; null when it is neither. */
export function parseIdentifier(raw: string): Identifier | null {
  const v = raw.trim();
  if (v.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { email: v.toLowerCase().slice(0, 160) } : null;
  const phone = normalizePhone(v);
  return phone ? { phone } : null;
}
const whereId = (id: Identifier) => ("email" in id ? eq(customerAccounts.email, id.email) : eq(customerAccounts.phone, id.phone));
const idKey = (id: Identifier) => sha256(`customer:${"email" in id ? id.email : id.phone}`);

// ---- sessions ---------------------------------------------------------------------------------------------------
async function startSession(accountId: number, keep: boolean) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (keep ? KEEP_DAYS * 86_400_000 : SHORT_HOURS * 3_600_000));
  await db.insert(customerSessions).values({ id: sha256(token), accountId, expiresAt });
  await db.update(customerAccounts).set({ lastLoginAt: new Date() }).where(eq(customerAccounts.id, accountId));
  const store = await cookies();
  const base = { path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", ...(keep ? { expires: expiresAt } : {}) };
  store.set(CUSTOMER_COOKIE, token, { ...base, httpOnly: true });
  store.set(SIGNED_IN_HINT, "1", { ...base, httpOnly: false });
}

export async function endCustomerSession() {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;
  if (token) await db.delete(customerSessions).where(eq(customerSessions.id, sha256(token)));
  store.delete({ name: CUSTOMER_COOKIE, path: "/" });
  store.delete({ name: SIGNED_IN_HINT, path: "/" });
}

/** The signed-in customer for this request (with the linked customer record, if any), or null. */
export const currentCustomer = cache(async () => {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db.select({ a: customerAccounts }).from(customerSessions).innerJoin(customerAccounts, eq(customerSessions.accountId, customerAccounts.id))
    .where(and(eq(customerSessions.id, sha256(token)), gt(customerSessions.expiresAt, new Date())));
  return row?.a ?? null;
});
export type CustomerAccount = NonNullable<Awaited<ReturnType<typeof currentCustomer>>>;

// ---- create account / log in -------------------------------------------------------------------------------------
export type AuthError = "invalid" | "password" | "taken" | "wrong" | "locked";

export async function createAccount(input: { name: string; identifier: string; password: string; keep: boolean; lang: "ar" | "en" }):
  Promise<{ ok: true; account: CustomerAccount; mailFailed: boolean } | { ok: false; error: AuthError }> {
  const name = input.name.trim().slice(0, 120);
  const id = parseIdentifier(input.identifier);
  if (name.length < 2 || !id) return { ok: false, error: "invalid" };
  if (input.password.length < 8 || input.password.length > 200) return { ok: false, error: "password" };
  const [exists] = await db.select({ id: customerAccounts.id }).from(customerAccounts).where(whereId(id));
  if (exists) return { ok: false, error: "taken" };
  const [account] = await db.insert(customerAccounts).values({ name, ...id, passwordHash: await bcrypt.hash(input.password, 12), language: input.lang })
    .onConflictDoNothing().returning();
  if (!account) return { ok: false, error: "taken" };
  await db.insert(auditLog).values({ action: "customer_account_created", entity: "customer_account", entityId: String(account.id), data: {} });
  await startSession(account.id, input.keep);
  const mailFailed = "email" in id && (await sendCode(account, "verify_email").catch(() => "failed")) !== "sent";
  return { ok: true, account, mailFailed };
}

/** Same answer for an unknown account and a wrong password; 5 failures in 15 minutes lock that account for a while. */
export async function logIn(identifier: string, password: string, keep: boolean): Promise<{ ok: true } | { ok: false; error: AuthError }> {
  const id = parseIdentifier(identifier);
  if (!id) return { ok: false, error: "wrong" };
  const [{ n }] = await db.select({ n: count() }).from(auditLog).where(and(eq(auditLog.action, "customer_login_failed"),
    gt(auditLog.at, new Date(Date.now() - 15 * 60_000)), sql`${auditLog.data}->>'who' = ${idKey(id)}`));
  if (n >= 5) return { ok: false, error: "locked" };
  const [account] = await db.select().from(customerAccounts).where(whereId(id));
  const good = account ? await bcrypt.compare(password, account.passwordHash) : await bcrypt.compare(password, DUMMY_HASH);
  if (!account || !good) {
    await db.insert(auditLog).values({ action: "customer_login_failed", entity: "customer_account", entityId: account ? String(account.id) : null, data: { who: idKey(id) } });
    return { ok: false, error: "wrong" };
  }
  await startSession(account.id, keep);
  return { ok: true };
}

// ---- one-time codes ------------------------------------------------------------------------------------------------
const TEXT = {
  verify_email: {
    ar: { subject: "عقار 360: رمز تأكيد البريد", body: "رمز تأكيد بريدك الإلكتروني: {code}\nصالح لمدة 15 دقيقة. إذا لم تطلبه فتجاهل هذه الرسالة." },
    en: { subject: "Aqar 360: your email code", body: "Your email confirmation code: {code}\nIt is valid for 15 minutes. If you did not ask for it, ignore this message." },
  },
  reset_password: {
    ar: { subject: "عقار 360: رمز إعادة تعيين كلمة المرور", body: "رمز إعادة تعيين كلمة المرور: {code}\nصالح لمدة 15 دقيقة. إذا لم تطلبه فتجاهل هذه الرسالة." },
    en: { subject: "Aqar 360: password reset code", body: "Your password reset code: {code}\nIt is valid for 15 minutes. If you did not ask for it, ignore this message." },
  },
} as const;

/** Emails a 6-digit code (at most 3 an hour per purpose). A code that could not be sent is removed, so it does not use up the limit. */
export async function sendCode(account: { id: number; email: string | null; language: "ar" | "en" }, purpose: "verify_email" | "reset_password"): Promise<"sent" | "limit" | "failed"> {
  if (!account.email) return "failed";
  const [{ n }] = await db.select({ n: count() }).from(customerCodes).where(and(eq(customerCodes.accountId, account.id),
    eq(customerCodes.purpose, purpose), gt(customerCodes.createdAt, new Date(Date.now() - 3_600_000))));
  if (n >= 3) return "limit";
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const [row] = await db.insert(customerCodes).values({ accountId: account.id, purpose, codeHash: codeHash(account.id, purpose, code), expiresAt: new Date(Date.now() + 15 * 60_000) }).returning({ id: customerCodes.id });
  const t = TEXT[purpose][account.language];
  const result = await sendStaffEmail(account.email, t.subject, t.body.replace("{code}", code));
  if (result.status === "sent") return "sent";
  console.error("customer code email not sent:", result.reason);
  await db.delete(customerCodes).where(eq(customerCodes.id, row.id));
  return "failed";
}

/** Checks the newest unused code for this purpose (5 tries, 15 minutes); marks it used when right. */
async function useCode(accountId: number, purpose: "verify_email" | "reset_password", code: string) {
  const [row] = await db.select().from(customerCodes).where(and(eq(customerCodes.accountId, accountId), eq(customerCodes.purpose, purpose),
    isNull(customerCodes.usedAt), gt(customerCodes.expiresAt, new Date()))).orderBy(desc(customerCodes.createdAt)).limit(1);
  if (!row || row.attempts >= 5) return false;
  const given = Buffer.from(codeHash(accountId, purpose, code.replace(/\s/g, "")));
  const ok = given.length === Buffer.from(row.codeHash).length && timingSafeEqual(given, Buffer.from(row.codeHash));
  await db.update(customerCodes).set(ok ? { usedAt: new Date() } : { attempts: row.attempts + 1 }).where(eq(customerCodes.id, row.id));
  return ok;
}

// ---- linking the account to its customer record -------------------------------------------------------------------
export type LinkVia = "email_code" | "private_link" | "staff" | "new_request";

/** Links the account to a customer record; never moves an account that is already linked to another record. */
export async function linkAccount(accountId: number, contactId: number, via: LinkVia) {
  const [taken] = await db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq(customerAccounts.contactId, contactId));
  if (taken && taken.id !== accountId) return false;
  const [done] = await db.update(customerAccounts).set({ contactId, linkedVia: via, updatedAt: new Date() })
    .where(and(eq(customerAccounts.id, accountId), sql`(${customerAccounts.contactId} is null or ${customerAccounts.contactId} = ${contactId})`)).returning();
  if (done) await db.insert(auditLog).values({ action: "customer_account_linked", entity: "contact", entityId: String(contactId), data: { account: accountId, via } });
  return !!done;
}

/** Email confirmed with the code: link to the customer with that email (or start one). */
export async function verifyEmail(account: CustomerAccount, code: string) {
  if (!account.email || !(await useCode(account.id, "verify_email", code))) return false;
  await db.update(customerAccounts).set({ emailVerifiedAt: new Date() }).where(eq(customerAccounts.id, account.id));
  if (!account.contactId) {
    const [existing] = await db.select({ id: contacts.id }).from(contacts).where(sql`lower(${contacts.email}) = ${account.email}`).limit(1);
    const contactId = existing?.id ?? (await db.insert(contacts).values({ name: account.name, email: account.email, phone: account.phone,
      language: account.language, source: "Website account" }).returning({ id: contacts.id }))[0].id;
    await linkAccount(account.id, contactId, "email_code");
  }
  return true;
}

/**
 * A signed-in customer without a record sent a request that started a NEW customer record with the account's own
 * phone or email: that record is theirs. A returning record is never linked this way (anyone can type a number).
 */
export async function linkNewRequest(contact: { id: number; returning: boolean; phone: string; email?: string }) {
  const account = await currentCustomer();
  if (!account || account.contactId || contact.returning) return false;
  const same = (account.phone && account.phone === contact.phone) || (account.email && account.email === contact.email?.toLowerCase());
  return same ? linkAccount(account.id, contact.id, "new_request") : false;
}

/** Forgot password: always the same answer (no account discovery); only accounts with an email can reset online. */
export async function startReset(identifier: string) {
  const id = parseIdentifier(identifier);
  if (!id) return;
  const [account] = await db.select().from(customerAccounts).where(whereId(id));
  if (account?.email) await sendCode(account, "reset_password").catch(() => undefined);
}

export async function finishReset(identifier: string, code: string, password: string, keep: boolean): Promise<{ ok: true } | { ok: false; error: AuthError }> {
  if (password.length < 8 || password.length > 200) return { ok: false, error: "password" };
  const id = parseIdentifier(identifier);
  const [account] = id ? await db.select().from(customerAccounts).where(whereId(id)) : [];
  if (!account || !(await useCode(account.id, "reset_password", code))) return { ok: false, error: "wrong" };
  await db.update(customerAccounts).set({ passwordHash: await bcrypt.hash(password, 12), updatedAt: new Date() }).where(eq(customerAccounts.id, account.id));
  await db.delete(customerSessions).where(eq(customerSessions.accountId, account.id)); // every old login ends
  await db.insert(auditLog).values({ action: "customer_password_reset", entity: "customer_account", entityId: String(account.id), data: {} });
  await startSession(account.id, keep);
  return { ok: true };
}
