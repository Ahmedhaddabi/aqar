"use server";

import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { LANG_COOKIE } from "@/admin/i18n";
import { db } from "@/db";
import { type AppKey, APPS, ROLES, sessions, users } from "@/db/schema";
import {
  audit, clearPendingMfa, currentUser, endSession, hashPassword, hasAnyUser, isLockedOut, MIN_PASSWORD, pendingMfaUser, requireUser,
  startPendingMfa, startSession, verifyLogin,
} from "@/lib/auth";
import { newSecret, openSecret, sealSecret, verifyCode } from "@/lib/totp";

/** Error keys are translated by the form (admin/i18n.ts). */
export type FormState = { error?: string; fields?: Record<string, string>; ok?: boolean; step?: "code" };

const email = z.string().trim().toLowerCase().email();
const password = z.string().min(MIN_PASSWORD);
const text = (max = 120) => z.string().trim().min(1).max(max);

function fieldErrors(error: z.ZodError): FormState {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]);
    fields[key] ??= key === "password" || key === "newPassword" ? "shortPassword" : key === "email" ? "email" : "required";
  }
  return { fields };
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "invalid" };
  if (await isLockedOut(parsed.data.email)) return { error: "locked" };
  const user = await verifyLogin(parsed.data.email, parsed.data.password);
  if (!user) return { error: "invalid" };
  if (user.mfaEnabled && user.mfaSecret) {
    await startPendingMfa(user.id);
    return { step: "code" };
  }
  await startSession(user.id);
  redirect("/admin/apps");
}

/** Second step: the 6-digit code from the authenticator app. Wrong codes count towards the same lockout. */
export async function loginCode(_prev: FormState, form: FormData): Promise<FormState> {
  const userId = await pendingMfaUser();
  if (!userId) return { error: "expired" };
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user?.active || !user.mfaSecret) return { error: "expired" };
  if (await isLockedOut(user.email)) return { error: "locked", step: "code" };
  if (!verifyCode(openSecret(user.mfaSecret), String(form.get("code") ?? ""))) {
    await audit("login_failed", "user", user.id, { email: user.email, step: "code" });
    return { error: "badCode", step: "code" };
  }
  await clearPendingMfa();
  await startSession(user.id);
  redirect("/admin/apps");
}

export async function logout() {
  const user = await currentUser();
  await endSession();
  if (user) await audit("logout", "user", user.id, {}, user.id);
  redirect("/admin/login");
}

function sameSecret(given: string, expected: string | undefined) {
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** First admin only; closes itself as soon as one account exists. */
export async function setupAdmin(_prev: FormState, form: FormData): Promise<FormState> {
  if (await hasAnyUser()) redirect("/admin/login");
  const parsed = z.object({ token: z.string(), name: text(), email, password }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrors(parsed.error);
  if (!sameSecret(parsed.data.token, process.env.ADMIN_SETUP_TOKEN)) {
    await audit("setup_refused", "user", null);
    return { error: "wrongToken" };
  }
  const [user] = await db.insert(users).values({ name: parsed.data.name, email: parsed.data.email, role: "admin",
    apps: [...APPS], passwordHash: await hashPassword(parsed.data.password) }).returning();
  await audit("user_created", "user", user.id, { role: "admin", via: "setup" }, user.id);
  await startSession(user.id);
  redirect("/admin/apps");
}

export async function setLanguage(form: FormData) {
  const lang = form.get("lang") === "en" ? "en" : "ar";
  (await cookies()).set(LANG_COOKIE, lang, { path: "/admin", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const user = await currentUser();
  if (user) await db.update(users).set({ language: lang }).where(eq(users.id, user.id));
  const back = String(form.get("path") || "/admin");
  redirect(back.startsWith("/admin") ? back : "/admin");
}

// ---- Staff accounts (admins only) ------------------------------------------------------------------------------
/** Ticked apps; when none are ticked the role decides (agents: CRM; managers: all). */
function appsFrom(form: FormData, role: string): AppKey[] {
  const ticked = APPS.filter((a) => form.getAll("apps").includes(a));
  return ticked.length ? ticked : role === "agent" ? ["crm"] : [...APPS];
}

export async function setApps(form: FormData) {
  const admin = await requireUser(["admin"]);
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  const apps = APPS.filter((a) => form.getAll("apps").includes(a));
  await db.update(users).set({ apps: apps.length ? apps : ["crm"] }).where(eq(users.id, id));
  await audit("user_apps_changed", "user", id, { apps }, admin.id);
  revalidatePath("/admin/users");
}

export async function createUser(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["admin"]);
  const parsed = z.object({ name: text(), email, role: z.enum(ROLES), password }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrors(parsed.error);
  const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email));
  if (exists.length) return { fields: { email: "emailTaken" } };
  const apps = appsFrom(form, parsed.data.role);
  const [user] = await db.insert(users).values({ name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, apps,
    passwordHash: await hashPassword(parsed.data.password) }).returning();
  await audit("user_created", "user", user.id, { role: user.role }, admin.id);
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function toggleUser(form: FormData) {
  const admin = await requireUser(["admin"]);
  const id = Number(form.get("id"));
  if (id === admin.id) redirect("/admin/users?error=cannotDisableSelf");
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (user) {
    await db.update(users).set({ active: !user.active }).where(eq(users.id, id));
    if (user.active) await db.delete(sessions).where(eq(sessions.userId, id)); // signed out everywhere
    await audit(user.active ? "user_disabled" : "user_enabled", "user", id, {}, admin.id);
  }
  revalidatePath("/admin/users");
}

export async function changeRole(form: FormData) {
  const admin = await requireUser(["admin"]);
  const id = Number(form.get("id"));
  const role = z.enum(ROLES).safeParse(form.get("role"));
  if (!role.success || id === admin.id) return; // admins keep their own role, so the system always has one
  await db.update(users).set({ role: role.data }).where(eq(users.id, id));
  await audit("user_role_changed", "user", id, { role: role.data }, admin.id);
  revalidatePath("/admin/users");
}

export async function resetPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["admin"]);
  const parsed = z.object({ id: z.coerce.number(), newPassword: password }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrors(parsed.error);
  await db.update(users).set({ passwordHash: await hashPassword(parsed.data.newPassword) }).where(eq(users.id, parsed.data.id));
  if (parsed.data.id !== admin.id) await db.delete(sessions).where(eq(sessions.userId, parsed.data.id));
  await audit("user_password_reset", "user", parsed.data.id, {}, admin.id);
  return { ok: true };
}

// ---- My account: own password and two-step sign-in --------------------------------------------------------------
export async function changeOwnPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const parsed = z.object({ current: z.string().min(1), newPassword: password }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrors(parsed.error);
  if (!(await verifyLogin(me.email, parsed.data.current))) return { fields: { current: "wrongPassword" } };
  await db.update(users).set({ passwordHash: await hashPassword(parsed.data.newPassword) }).where(eq(users.id, me.id));
  await audit("password_changed", "user", me.id, {}, me.id);
  return { ok: true };
}

/** Step 1: a new key (not active yet) is stored so the QR code can be shown. */
export async function startMfa() {
  const me = await requireUser();
  if (me.mfaEnabled) return;
  await db.update(users).set({ mfaSecret: sealSecret(newSecret()) }).where(eq(users.id, me.id));
  revalidatePath("/admin/account");
}

/** Step 2: the first code from the phone proves the key was scanned; only then is it switched on. */
export async function confirmMfa(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const [row] = await db.select({ secret: users.mfaSecret }).from(users).where(eq(users.id, me.id));
  if (!row?.secret || !verifyCode(openSecret(row.secret), String(form.get("code") ?? ""))) return { error: "badCode" };
  await db.update(users).set({ mfaEnabled: true }).where(eq(users.id, me.id));
  await audit("mfa_enabled", "user", me.id, {}, me.id);
  revalidatePath("/admin/account");
  return { ok: true };
}

export async function disableMfa(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const [row] = await db.select({ secret: users.mfaSecret }).from(users).where(eq(users.id, me.id));
  if (!row?.secret || !verifyCode(openSecret(row.secret), String(form.get("code") ?? ""))) return { error: "badCode" };
  await db.update(users).set({ mfaEnabled: false, mfaSecret: null }).where(eq(users.id, me.id));
  await audit("mfa_disabled", "user", me.id, {}, me.id);
  revalidatePath("/admin/account");
  return { ok: true };
}

/** For a staff member who lost their phone: the admin switches it off; they set it up again after signing in. */
export async function resetMfa(form: FormData) {
  const admin = await requireUser(["admin"]);
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  await db.update(users).set({ mfaEnabled: false, mfaSecret: null }).where(eq(users.id, id));
  await db.delete(sessions).where(eq(sessions.userId, id));
  await audit("mfa_reset", "user", id, {}, admin.id);
  revalidatePath("/admin/users");
}
