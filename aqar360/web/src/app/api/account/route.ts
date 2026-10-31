import { NextResponse, type NextRequest } from "next/server";

import { frappeCall, frappeLogin, frappeLogout, frappeMethod } from "@/lib/frappe";
import { clientIp, readJson, reject, sameOrigin } from "@/lib/request";
import { getSession, SESSION_COOKIE_NAMES, sessionCookies } from "@/lib/session";

const str = (value: unknown, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const done = (data: unknown = {}) => NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });

/** Customer account actions: login, logout, signup, reset, withdraw (consent). */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject(403, "not_permitted", "Cross-site requests are not allowed.");
  const body = await readJson(request, 4_000);
  if (!body) return reject(400, "invalid_request", "Invalid request body.");
  const ip = clientIp(request);

  switch (body.action) {
    case "login": {
      const email = str(body.email);
      const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
      if (!email || !password) return reject(400, "invalid_input", "Enter your email and password.");
      const login = await frappeLogin(email, password, ip);
      if (!login.ok) {
        return login.status === 429
          ? reject(429, "rate_limited", "Too many attempts. Please try again later.")
          : reject(401, "invalid_credentials", "Email or password is incorrect.");
      }
      const info = await frappeCall<{ full_name: string; csrf_token: string }>("account.session_info",
        { session: { sid: login.sid }, clientIp: ip });
      if (!info.ok) {
        // Staff and other non-customer users sign in on the staff desk, not the public site.
        await frappeLogout(login.sid);
        return reject(403, "not_customer", "This sign-in is for customer accounts.");
      }
      const response = done({ full_name: info.data.full_name });
      for (const cookie of sessionCookies(login.sid, info.data.csrf_token)) response.cookies.set(cookie);
      return response;
    }
    case "logout": {
      const session = await getSession();
      if (session) await frappeLogout(session.sid, session.csrf);
      const response = done();
      for (const name of SESSION_COOKIE_NAMES) response.cookies.delete(name);
      return response;
    }
    case "signup": {
      const email = str(body.email);
      const fullName = str(body.full_name, 140);
      if (!email || !fullName) return reject(400, "invalid_input", "Enter your name and email.");
      await frappeMethod("frappe.core.doctype.user.user.sign_up", {
        verb: "POST", body: { email, full_name: fullName, redirect_to: "/" }, clientIp: ip });
      // Same answer whether or not the email already exists (no account enumeration).
      return done({ sent: true });
    }
    case "reset": {
      const email = str(body.email);
      if (!email) return reject(400, "invalid_input", "Enter your email.");
      await frappeMethod("frappe.core.doctype.user.user.reset_password", { verb: "POST", body: { user: email }, clientIp: ip });
      return done({ sent: true });
    }
    case "withdraw": {
      const session = await getSession();
      if (!session) return reject(401, "not_permitted", "Please sign in again.");
      const result = await frappeCall("account.withdraw_consent", { verb: "POST", session, clientIp: ip,
        body: { purpose: str(body.purpose), channel: str(body.channel) } });
      return result.ok ? done(result.data) : reject(result.status, result.error.code, result.error.message);
    }
    default:
      return reject(400, "invalid_request", "Unknown action.");
  }
}
