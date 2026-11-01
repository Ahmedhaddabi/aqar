// Thawani Pay (Oman) hosted checkout. API: POST/GET {base}/checkout/session with the `thawani-api-key` header;
// customers pay at {checkout}/pay/{session_id}?key={publishable key}. Amounts are in baisa (1 OMR = 1000).
// Webhooks: HMAC-SHA256(webhook secret, `${raw body}-${thawani-timestamp}`) in hex, sent as `thawani-signature`.
import { createHmac, timingSafeEqual } from "node:crypto";

import { integrationConfig } from "../integrations";

/** Keys from Admin → Integrations (or the server environment); empty while Thawani is off. */
export async function thawaniConfig() {
  const c = await integrationConfig("thawani");
  const live = c?.mode === "live";
  return {
    secretKey: c?.secretKey ?? "",
    publishableKey: c?.publishableKey ?? "",
    webhookSecret: c?.webhookSecret ?? "",
    live,
    host: live ? "https://checkout.thawani.om" : "https://uatcheckout.thawani.om",
  };
}

export const thawaniReady = async () => { const c = await thawaniConfig(); return !!(c.secretKey && c.publishableKey); };

type Session = { session_id: string; client_reference_id: string; payment_status: "paid" | "unpaid" | "cancelled" | string;
  total_amount: number; currency?: string; invoice?: string };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const c = await thawaniConfig();
  const res = await fetch(`${c.host}/api/v1${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", "thawani-api-key": c.secretKey, ...init?.headers } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(`thawani ${res.status} ${json.code ?? ""} ${json.description ?? ""}`.trim());
  return json.data as T;
}

/** Product names are limited by Thawani; one line with the invoice number keeps it simple and within limits. */
export async function createThawaniSession(opts: { reference: string; title: string; amountBaisa: number; successUrl: string;
  cancelUrl: string; metadata: Record<string, string> }) {
  const data = await call<Session>("/checkout/session", { method: "POST", body: JSON.stringify({
    client_reference_id: opts.reference, mode: "payment",
    products: [{ name: opts.title.slice(0, 40), quantity: 1, unit_amount: opts.amountBaisa }],
    success_url: opts.successUrl, cancel_url: opts.cancelUrl, metadata: opts.metadata }) });
  const c = await thawaniConfig();
  return { sessionId: data.session_id, url: `${c.host}/pay/${data.session_id}?key=${encodeURIComponent(c.publishableKey)}` };
}

export const getThawaniSession = (sessionId: string) => call<Session>(`/checkout/session/${encodeURIComponent(sessionId)}`);

export async function validThawaniSignature(rawBody: string, signature: string | null, timestamp: string | null) {
  const { webhookSecret } = await thawaniConfig();
  if (!webhookSecret || !signature || !timestamp) return false;
  const expected = Buffer.from(createHmac("sha256", webhookSecret).update(`${rawBody}-${timestamp}`).digest("hex"));
  const given = Buffer.from(signature.trim().toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}
