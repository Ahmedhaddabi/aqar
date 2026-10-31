// Customer session: the Frappe session id and CSRF token live only in httpOnly cookies on this site.
import { cookies } from "next/headers";

import { siteUrl } from "./config";

const SID = "aqar_sid";
const CSRF = "aqar_csrf";
const MAX_AGE = 2 * 60 * 60; // matches the Frappe session expiry (System Settings, two hours)

export async function getSession() {
  const store = await cookies();
  const sid = store.get(SID)?.value;
  return sid ? { sid, csrf: store.get(CSRF)?.value } : null;
}

export function sessionCookies(sid: string, csrf: string) {
  const options = { httpOnly: true, sameSite: "lax" as const, secure: siteUrl.startsWith("https://"), path: "/", maxAge: MAX_AGE };
  return [
    { name: SID, value: sid, ...options },
    { name: CSRF, value: csrf, ...options },
  ];
}

export const SESSION_COOKIE_NAMES = [SID, CSRF];
