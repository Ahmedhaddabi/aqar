// Server-only client for the Frappe backend. The browser never talks to Frappe directly.
// Node's fetch drops the Host header, so node:http is used to address the right Frappe site.
import http from "node:http";
import https from "node:https";

export type ApiError = { code: string; message: string; request_id?: string; fields?: Record<string, string> | null };
export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiError };

const backend = new URL(process.env.FRAPPE_URL || "http://127.0.0.1:8080");
const siteHost = process.env.FRAPPE_SITE || "staging.localhost";
const unavailable: ApiError = { code: "backend_unavailable", message: "The service is temporarily unavailable." };

type CallOptions = {
  verb?: "GET" | "POST";
  params?: Record<string, string | number | undefined>;
  body?: unknown;
  clientIp?: string;
  /** Logged-in customer: Frappe session id, plus the CSRF token Frappe requires on POST. */
  session?: { sid: string; csrf?: string };
};

function request(path: string, verb: string, headers: Record<string, string | number>, payload?: string) {
  const client = backend.protocol === "https:" ? https : http;
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = client.request(
      {
        hostname: backend.hostname,
        port: backend.port || (backend.protocol === "https:" ? 443 : 80),
        path,
        method: verb,
        timeout: 15000,
        headers: { Host: siteHost, "X-Frappe-Site-Name": siteHost, ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 502, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Calls an aqar360 API method, e.g. frappeCall("public.get_form_config"). */
export function frappeCall<T>(method: string, options: CallOptions = {}): Promise<ApiResult<T>> {
  return frappeMethod<T>(`aqar360.api.${method}`, options);
}

/** Calls any whitelisted Frappe method by its full dotted path. */
export async function frappeMethod<T>(method: string, options: CallOptions = {}): Promise<ApiResult<T>> {
  const { verb = "GET", params, body, clientIp, session } = options;
  const query = params
    ? "?" + new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]),
      )
    : "";
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const headers: Record<string, string | number> = { Accept: "application/json" };
  if (payload) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(payload);
  }
  if (clientIp) headers["X-Forwarded-For"] = clientIp;
  if (session) {
    headers.Cookie = `sid=${session.sid}`;
    if (session.csrf) headers["X-Frappe-CSRF-Token"] = session.csrf;
  }
  try {
    const res = await request(`/api/method/${method}${query}`, verb, headers, payload);
    return parse<T>(res.status, res.body.toString("utf8"));
  } catch {
    return { ok: false, status: 502, error: unavailable };
  }
}

/** Frappe password login; returns the session id from the sid cookie. */
export async function frappeLogin(email: string, password: string, clientIp?: string) {
  const payload = JSON.stringify({ usr: email, pwd: password });
  const headers: Record<string, string | number> = {
    Accept: "application/json", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload),
  };
  if (clientIp) headers["X-Forwarded-For"] = clientIp;
  try {
    const res = await request("/api/method/login", "POST", headers, payload);
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] || []);
    const sid = cookies.map((c) => /^sid=([^;]+)/.exec(c)?.[1]).find((v) => v && v !== "Guest");
    if (res.status === 200 && sid) return { ok: true as const, sid };
    return { ok: false as const, status: res.status === 429 ? 429 : 401 };
  } catch {
    return { ok: false as const, status: 502 };
  }
}

/** Ends the Frappe session server-side. Frappe's logout is POST-only and needs the session's CSRF token;
 * when it is not known yet (e.g. a refused staff login) it is fetched for that session first. */
export async function frappeLogout(sid: string, csrf?: string) {
  let token = csrf;
  if (!token) {
    const res = await frappeCall<string>("account.session_token", { session: { sid } });
    token = res.ok ? res.data : undefined;
  }
  await frappeMethod("logout", { verb: "POST", session: { sid, csrf: token } }).catch(() => undefined);
}

function parse<T>(status: number, raw: string): ApiResult<T> {
  let json: { message?: unknown; exc_type?: string };
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, status: 502, error: unavailable };
  }
  const message = json.message as { error?: ApiError } | undefined;
  if (message && typeof message === "object" && !Array.isArray(message) && message.error) {
    return { ok: false, status, error: message.error };
  }
  if (status === 429 || json.exc_type === "RateLimitExceededError") {
    return { ok: false, status: 429, error: { code: "rate_limited", message: "Too many requests. Please try again later." } };
  }
  const native: Record<string, ApiError> = {
    PermissionError: { code: "not_permitted", message: "Please sign in again." },
    CSRFTokenError: { code: "not_permitted", message: "Please sign in again." },
    SessionExpired: { code: "not_permitted", message: "Please sign in again." },
    DoesNotExistError: { code: "not_found", message: "Not found." },
  };
  if (json.exc_type && native[json.exc_type]) return { ok: false, status, error: native[json.exc_type] };
  if (status >= 400) return { ok: false, status, error: unavailable };
  return { ok: true, status, data: json.message as T };
}

/** Public files only (/files/...); private files are never proxied. */
export async function frappeFile(path: string) {
  return request(`/files/${path}`, "GET", {});
}
