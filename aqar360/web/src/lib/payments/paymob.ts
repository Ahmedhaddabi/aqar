// Paymob (Oman) Intention API + Unified Checkout. POST {base}/v1/intention/ with `Authorization: Token <secret key>`;
// customers pay at {checkout}/?publicKey=…&clientSecret=…. `amount` is in the currency's smallest unit (cents);
// for OMR that is baisa, so the factor is 1000 (PAYMOB_AMOUNT_FACTOR confirms it with the first test payment).
// Callbacks (POST notification and GET redirection) carry `hmac` = HMAC-SHA512(HMAC secret, 20 ordered fields).
import { createHmac, timingSafeEqual } from "node:crypto";

export const paymobConfig = () => ({
  secretKey: process.env.PAYMOB_SECRET_KEY ?? "",
  publicKey: process.env.PAYMOB_PUBLIC_KEY ?? "",
  hmacSecret: process.env.PAYMOB_HMAC_SECRET ?? "",
  integrationIds: (process.env.PAYMOB_INTEGRATION_IDS ?? "").split(",").map((v) => v.trim()).filter(Boolean)
    .map((v) => (/^\d+$/.test(v) ? Number(v) : v)),
  base: (process.env.PAYMOB_BASE_URL || "https://oman.paymob.com").replace(/\/$/, ""),
  checkout: (process.env.PAYMOB_CHECKOUT_URL || "https://om.checkout.paymob.com").replace(/\/$/, ""),
  factor: Number(process.env.PAYMOB_AMOUNT_FACTOR) || 1000,
  currency: process.env.PAYMOB_CURRENCY || "OMR",
  live: (process.env.PAYMOB_SECRET_KEY ?? "").includes("_live_"),
});

export const paymobReady = () => { const c = paymobConfig(); return !!(c.secretKey && c.publicKey && c.hmacSecret && c.integrationIds.length); };

export async function createPaymobIntention(opts: { reference: string; title: string; amount: number; customer: { name: string;
  phone: string | null; email: string | null }; notificationUrl: string; redirectionUrl: string; extras: Record<string, string> }) {
  const c = paymobConfig();
  const cents = Math.round(opts.amount * c.factor);
  const [first, ...rest] = opts.customer.name.trim().split(/\s+/);
  const body = {
    amount: cents, currency: c.currency, payment_methods: c.integrationIds,
    items: [{ name: opts.title.slice(0, 50), amount: cents, description: opts.title.slice(0, 255), quantity: 1 }],
    // Paymob requires every billing field; "NA" is its documented placeholder for unknown address parts.
    billing_data: { first_name: first || "Customer", last_name: rest.join(" ") || "NA", email: opts.customer.email || "na@example.com",
      phone_number: opts.customer.phone || "NA", apartment: "NA", floor: "NA", street: "NA", building: "NA", city: "Muscat",
      state: "NA", country: "OM", postal_code: "NA" },
    special_reference: opts.reference, notification_url: opts.notificationUrl, redirection_url: opts.redirectionUrl, extras: opts.extras,
  };
  const res = await fetch(`${c.base}/v1/intention/`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", Authorization: `Token ${c.secretKey}` }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.client_secret) throw new Error(`paymob ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return { intentionId: String(json.id ?? ""), url: `${c.checkout}/?publicKey=${encodeURIComponent(c.publicKey)}&clientSecret=${encodeURIComponent(json.client_secret)}` };
}

// Field order from Paymob's "HMAC Transaction Callback" page. POST uses obj.id / obj.order.id; GET uses id / order (or order_id).
const FIELDS = ["amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id",
  "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided", "order.id", "owner", "pending",
  "source_data.pan", "source_data.sub_type", "source_data.type", "success"] as const;

const str = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "boolean" ? String(v) : String(v));

function matches(concatenated: string, hmac: string | null) {
  const { hmacSecret } = paymobConfig();
  if (!hmacSecret || !hmac) return false;
  const expected = Buffer.from(createHmac("sha512", hmacSecret).update(concatenated).digest("hex"));
  const given = Buffer.from(hmac.trim().toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type PaymobTxn = { id: string; success: boolean; pending: boolean; amountCents: number; currency: string; reference: string };

/** POST notification: body { type: "TRANSACTION", obj: {...} }, hmac in the query string. */
export function verifyPaymobProcessed(body: { type?: string; obj?: Record<string, unknown> }, hmac: string | null): PaymobTxn | null {
  const obj = body?.obj;
  if (!obj || (body.type && body.type !== "TRANSACTION")) return null;
  const get = (path: string) => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
  if (!matches(FIELDS.map((f) => str(get(f))).join(""), hmac)) return null;
  const order = (obj.order ?? {}) as Record<string, unknown>;
  return { id: str(obj.id), success: obj.success === true, pending: obj.pending === true, amountCents: Number(obj.amount_cents),
    currency: str(obj.currency), reference: str(order.merchant_order_id) };
}

/** GET redirection: the same fields arrive flattened as query parameters. */
export function verifyPaymobRedirect(q: URLSearchParams): PaymobTxn | null {
  const get = (f: string) => (f === "order.id" ? q.get("order") ?? q.get("order_id") : q.get(f)) ?? "";
  if (!matches(FIELDS.map(get).join(""), q.get("hmac"))) return null;
  return { id: get("id"), success: get("success") === "true", pending: get("pending") === "true", amountCents: Number(get("amount_cents")),
    currency: get("currency"), reference: q.get("merchant_order_id") ?? "" };
}
