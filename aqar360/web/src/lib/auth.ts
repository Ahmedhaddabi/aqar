// Staff login: bcrypt password hashes, database sessions (only a SHA-256 of the cookie token is stored),
// httpOnly cookie limited to /admin, lockout after repeated failures. Server-side only.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import bcrypt from "bcryptjs";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { type AppKey, auditLog, type Role, sessions, users } from "@/db/schema";

const COOKIE = "aqar_admin_session";
const SESSION_HOURS = 12;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
export const MIN_PASSWORD = 10;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const hashPassword = (password: string) => bcrypt.hash(password, 12);

export async function audit(action: string, entity: string, entityId: string | number | null, data: object = {},
  userId: number | null = null) {
  await db.insert(auditLog).values({ action, entity, entityId: entityId == null ? null : String(entityId), data, userId });
}

export async function isLockedOut(email: string) {
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000);
  const [row] = await db.select({ n: count() }).from(auditLog).where(and(eq(auditLog.action, "login_failed"),
    gt(auditLog.at, since), sql`${auditLog.data}->>'email' = ${email}`));
  return row.n >= MAX_FAILURES;
}

/** Returns the user on success. Unknown email and wrong password behave the same (no account discovery). */
export async function verifyLogin(email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = user?.active ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, DUMMY_HASH);
  if (!user || !user.active || !ok) {
    await audit("login_failed", "user", user?.id ?? null, { email });
    return null;
  }
  return user;
}
// Same bcrypt cost for unknown emails, so response time does not reveal which emails exist.
const DUMMY_HASH = "$2b$12$x4k7bEdB2R8AdCO3.w0guuQREbF4hOoKseaaMkaL5HsQzIqpAgkde";

export async function startSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/admin", expires: expiresAt });
  await audit("login", "user", userId, {}, userId);
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  store.delete({ name: COOKIE, path: "/admin" });
}

export type CurrentUser = { id: number; name: string; email: string; role: Role; language: "ar" | "en"; apps: AppKey[]; mfaEnabled: boolean };

/** The signed-in staff member for this request, or null. */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, language: users.language,
    apps: users.apps, mfaEnabled: users.mfaEnabled })
    .from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date()), eq(users.active, true)));
  return row ?? null;
});

/** For admin pages and actions: redirects to login, or refuses when the role is not allowed. */
export async function requireUser(roles?: Role[]) {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  if (roles && !roles.includes(user.role)) redirect("/admin/apps?denied=1");
  return user;
}

/** Admins open every app; everyone else opens the apps ticked on their staff account (CRM, ERP, HR). */
export const canOpen = (user: Pick<CurrentUser, "role" | "apps">, app: AppKey) => user.role === "admin" || user.apps.includes(app);
export const openApps = (user: Pick<CurrentUser, "role" | "apps">) => (["crm", "erp", "hr"] as const).filter((a) => canOpen(user, a));

/** For the pages of one app: the person must have that app (and, when given, one of the roles). */
export async function requireApp(app: AppKey, roles?: Role[]) {
  const user = await requireUser();
  if (!canOpen(user, app) || (roles && !roles.includes(user.role))) redirect("/admin/apps?denied=1");
  return user;
}

// ---- Two-step sign-in: after the password, a short-lived signed cookie waits for the 6-digit code ----------------
const PENDING = "aqar_admin_mfa";
const sign = (value: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`mfa-pending:${value}`).digest("base64url");

export async function startPendingMfa(userId: number) {
  const value = `${userId}.${Date.now() + 5 * 60_000}`;
  (await cookies()).set(PENDING, `${value}.${sign(value)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/admin", maxAge: 300 });
}

/** The user id waiting for a code, or null when there is none or it expired. */
export async function pendingMfaUser() {
  const raw = (await cookies()).get(PENDING)?.value ?? "";
  const [id, exp, sig] = raw.split(".");
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  const expected = Buffer.from(sign(`${id}.${exp}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? Number(id) : null;
}

export async function clearPendingMfa() {
  (await cookies()).delete({ name: PENDING, path: "/admin" });
}

export async function hasAnyUser() {
  const [row] = await db.select({ n: count() }).from(users);
  return row.n > 0;
}
