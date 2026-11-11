"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createAccount, currentCustomer, endCustomerSession, finishReset, logIn, sendCode, startReset, verifyEmail } from "@/lib/customer-auth";

const RESET_WHO = "aqar_reset_who"; // the email being reset, so the code step does not ask again (15 minutes)
const text = (form: FormData, key: string, max = 200) => String(form.get(key) ?? "").slice(0, max);
const langOf = (form: FormData) => (form.get("lang") === "en" ? "en" : "ar");

export async function loginAction(form: FormData) {
  const lang = langOf(form);
  const result = await logIn(text(form, "identifier").trim(), text(form, "password"), form.get("keep") === "on");
  redirect(result.ok ? `/${lang}/account` : `/${lang}/account/login?error=${result.error}`);
}

export async function signupAction(form: FormData) {
  const lang = langOf(form);
  const result = await createAccount({ name: text(form, "name", 120), identifier: text(form, "identifier"), password: text(form, "password"),
    keep: form.get("keep") === "on", lang });
  if (!result.ok) redirect(`/${lang}/account/login?mode=signup&error=${result.error}`);
  redirect(`/${lang}/account?done=welcome${result.mailFailed ? "&error=mail#connect" : ""}`);
}

export async function logoutAction(form: FormData) {
  await endCustomerSession();
  redirect(`/${langOf(form)}/account/login`);
}

export async function sendVerifyAction(form: FormData) {
  const lang = langOf(form);
  const account = await currentCustomer();
  if (!account) redirect(`/${lang}/account/login?error=expired`);
  const result = await sendCode(account, "verify_email").catch(() => "failed");
  redirect(`/${lang}/account?${result === "sent" ? "done=sent" : `error=${result === "limit" ? "limit" : "mail"}`}#connect`);
}

export async function verifyAction(form: FormData) {
  const lang = langOf(form);
  const account = await currentCustomer();
  if (!account) redirect(`/${lang}/account/login?error=expired`);
  const ok = await verifyEmail(account, text(form, "code", 20));
  redirect(ok ? `/${lang}/account?done=verified` : `/${lang}/account?error=code#connect`);
}

export async function forgotAction(form: FormData) {
  const lang = langOf(form);
  const who = text(form, "identifier").trim();
  await startReset(who);
  (await cookies()).set(RESET_WHO, who, { httpOnly: true, sameSite: "lax", path: `/${lang}/account`, maxAge: 15 * 60,
    secure: process.env.NODE_ENV === "production" });
  redirect(`/${lang}/account/forgot?step=code`);
}

export async function resetAction(form: FormData) {
  const lang = langOf(form);
  const store = await cookies();
  const who = store.get(RESET_WHO)?.value ?? "";
  const result = await finishReset(who, text(form, "code", 20), text(form, "password"), form.get("keep") === "on");
  if (!result.ok) redirect(`/${lang}/account/forgot?step=code&error=${result.error === "password" ? "password" : "code"}`);
  store.delete({ name: RESET_WHO, path: `/${lang}/account` });
  redirect(`/${lang}/account?done=reset`);
}
