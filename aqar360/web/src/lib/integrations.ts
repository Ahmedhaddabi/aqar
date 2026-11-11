// Connections to outside services, set up like credentials in n8n: an admin pastes the keys in Admin → Integrations,
// presses "Save and test" and switches the service on. Stored in `settings` under "integration:<id>"; secret fields are
// encrypted (AES-256-GCM, key from AUTH_SECRET) and never sent back to the browser. Server environment variables still
// work as a fallback, so a service already set up in Vercel keeps working until it is saved here.
import { randomBytes } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { settings } from "@/db/schema";

import { siteUrl } from "./config";
import { openSecret, sealSecret } from "./totp";

export const INTEGRATIONS = ["resend", "thawani", "paymob", "whatsapp", "anthropic", "openrouter"] as const;
export type IntegrationId = (typeof INTEGRATIONS)[number];

export type FieldDef = { name: string; env: string; secret?: boolean; required?: boolean; options?: string[]; default?: string;
  placeholder?: string; numeric?: boolean; generated?: boolean; modelList?: boolean };

export const AI_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];

export const FIELDS: Record<IntegrationId, FieldDef[]> = {
  resend: [
    { name: "apiKey", env: "RESEND_API_KEY", secret: true, required: true, placeholder: "re_…" },
    { name: "from", env: "MAIL_FROM", required: true, placeholder: "Aqar 360 <noreply@yourdomain.om>" },
  ],
  thawani: [
    { name: "mode", env: "THAWANI_MODE", options: ["test", "live"], default: "test" },
    { name: "secretKey", env: "THAWANI_SECRET_KEY", secret: true, required: true },
    { name: "publishableKey", env: "THAWANI_PUBLISHABLE_KEY", required: true },
    { name: "webhookSecret", env: "THAWANI_WEBHOOK_SECRET", secret: true },
  ],
  paymob: [
    { name: "secretKey", env: "PAYMOB_SECRET_KEY", secret: true, required: true, placeholder: "egy_sk_test_… / omn_sk_live_…" },
    { name: "publicKey", env: "PAYMOB_PUBLIC_KEY", required: true },
    { name: "hmacSecret", env: "PAYMOB_HMAC_SECRET", secret: true, required: true },
    { name: "integrationIds", env: "PAYMOB_INTEGRATION_IDS", required: true, placeholder: "12345, 67890" },
    { name: "amountFactor", env: "PAYMOB_AMOUNT_FACTOR", numeric: true, default: "1000" },
    { name: "baseUrl", env: "PAYMOB_BASE_URL", default: "https://oman.paymob.com" },
    { name: "checkoutUrl", env: "PAYMOB_CHECKOUT_URL", default: "https://om.checkout.paymob.com" },
    { name: "currency", env: "PAYMOB_CURRENCY", default: "OMR" },
  ],
  whatsapp: [
    { name: "token", env: "WHATSAPP_TOKEN", secret: true, required: true, placeholder: "EAAG…" },
    { name: "phoneNumberId", env: "WHATSAPP_PHONE_NUMBER_ID", required: true, placeholder: "1234567890" },
    { name: "appSecret", env: "WHATSAPP_APP_SECRET", secret: true },
    { name: "verifyToken", env: "WHATSAPP_VERIFY_TOKEN", generated: true },
    { name: "apiVersion", env: "WHATSAPP_API_VERSION", default: "v23.0" },
  ],
  anthropic: [
    { name: "apiKey", env: "ANTHROPIC_API_KEY", secret: true, required: true, placeholder: "sk-ant-…" },
    { name: "model", env: "AI_MODEL", options: AI_MODELS, default: "claude-opus-5-5" },
    { name: "perHour", env: "AI_PER_HOUR", numeric: true, default: "60" },
  ],
  openrouter: [
    { name: "apiKey", env: "OPENROUTER_API_KEY", secret: true, required: true, placeholder: "sk-or-…" },
    { name: "model", env: "OPENROUTER_MODEL", modelList: true, default: "openrouter/free" },
    { name: "perHour", env: "AI_PER_HOUR", numeric: true, default: "60" },
  ],
};

/** Addresses the customer pastes into the provider's dashboard. */
export const CALLBACKS: Record<IntegrationId, string[]> = {
  resend: [], anthropic: [], openrouter: [],
  thawani: [`${siteUrl}/api/webhooks/thawani`, `${siteUrl}/api/pay/return/thawani`],
  paymob: [`${siteUrl}/api/webhooks/paymob`, `${siteUrl}/api/pay/return/paymob`],
  whatsapp: [`${siteUrl}/api/webhooks/whatsapp`],
};

type TestResult = { ok: boolean; message: string; at: string };
type Stored = { enabled: boolean; values: Record<string, string>; test?: TestResult; updatedAt?: string };
const ENC = "enc:";
const keyOf = (id: IntegrationId) => `integration:${id}`;

async function readStored(id: IntegrationId): Promise<Stored | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, keyOf(id)));
  return (row?.value as Stored | undefined) ?? null;
}

/** Plain value of one stored field; a value sealed with a different AUTH_SECRET reads as empty (and is reported). */
function reveal(raw: string | undefined): { value: string; unreadable: boolean } {
  if (!raw) return { value: "", unreadable: false };
  if (!raw.startsWith(ENC)) return { value: raw, unreadable: false };
  try { return { value: openSecret(raw.slice(ENC.length)), unreadable: false }; } catch { return { value: "", unreadable: true }; }
}

function resolve(id: IntegrationId, stored: Stored | null) {
  const values: Record<string, string> = {};
  const unreadable: string[] = [];
  for (const f of FIELDS[id]) {
    const saved = reveal(stored?.values[f.name]);
    if (saved.unreadable) unreadable.push(f.name);
    values[f.name] = saved.value || process.env[f.env]?.trim() || f.default || "";
  }
  const complete = FIELDS[id].every((f) => !f.required || values[f.name]);
  const fromServer = FIELDS[id].some((f) => f.required && process.env[f.env]?.trim());
  return { values, unreadable, complete, enabled: stored ? stored.enabled : complete,
    source: stored ? ("app" as const) : fromServer ? ("server" as const) : ("none" as const) };
}

// Webhooks and pages read the same keys many times; a short cache keeps that to one query per service. It lives on
// globalThis so every copy of this module (bundler layers, dev reloads) sees a save at once.
const store = globalThis as typeof globalThis & { aqarIntegrations?: Map<IntegrationId, { at: number; data: ReturnType<typeof resolve> }> };
const cached = (store.aqarIntegrations ??= new Map());
const TTL = 15_000;

async function load(id: IntegrationId) {
  const hit = cached.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const data = resolve(id, await readStored(id));
  cached.set(id, { at: Date.now(), data });
  return data;
}

/** The keys of a service that is switched on and has every required field; null otherwise (the feature stays hidden). */
export async function integrationConfig(id: IntegrationId): Promise<Record<string, string> | null> {
  const c = await load(id);
  return c.enabled && c.complete ? c.values : null;
}

/** For Admin → Integrations: everything except secret values (only their last 4 characters). */
export async function integrationOverview() {
  return Promise.all(INTEGRATIONS.map(async (id) => {
    const stored = await readStored(id);
    const r = resolve(id, stored);
    const hints = Object.fromEntries(FIELDS[id].filter((f) => f.secret && r.values[f.name]).map((f) => [f.name, `••••${r.values[f.name].slice(-4)}`]));
    const plain = Object.fromEntries(FIELDS[id].filter((f) => !f.secret).map((f) => [f.name, r.values[f.name]]));
    return { id, enabled: r.enabled, complete: r.complete, source: r.source, unreadable: r.unreadable, hints, plain,
      test: stored?.test ?? null, updatedAt: stored?.updatedAt ?? null };
  }));
}

/**
 * Saves the form for one service. Secret fields left empty keep their saved value; `clear` lists the ones to remove.
 * WhatsApp's verify token is generated when missing (the customer copies it into Meta's dashboard).
 */
export async function saveIntegration(id: IntegrationId, input: Record<string, string>, clear: string[], enabled: boolean) {
  const stored = await readStored(id);
  const values: Record<string, string> = { ...stored?.values };
  for (const f of FIELDS[id]) {
    const given = (input[f.name] ?? "").trim();
    if (f.secret) {
      if (clear.includes(f.name)) delete values[f.name];
      else if (given) values[f.name] = ENC + sealSecret(given);
    } else if (f.options && given && !f.options.includes(given)) continue;
    else if (f.numeric && given && !/^\d+$/.test(given)) continue;
    else if (f.modelList && given && !/^[\w./:~-]+$/.test(given)) continue;
    else if (given) values[f.name] = given.slice(0, 500);
    else delete values[f.name];
  }
  if (id === "whatsapp" && !values.verifyToken && !process.env.WHATSAPP_VERIFY_TOKEN) values.verifyToken = randomBytes(18).toString("base64url");
  const next: Stored = { enabled, values, test: stored?.test, updatedAt: new Date().toISOString() };
  await db.insert(settings).values({ key: keyOf(id), value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next } });
  cached.delete(id);
  return resolve(id, next);
}

export async function removeIntegration(id: IntegrationId) {
  await db.delete(settings).where(eq(settings.key, keyOf(id)));
  cached.delete(id);
}

/** Runs the service's own check with the saved keys and keeps the result for the status badge. */
export async function testIntegration(id: IntegrationId, ctx: { email: string }): Promise<TestResult> {
  const r = resolve(id, await readStored(id));
  let result: { ok: boolean; message: string };
  if (!r.complete) result = { ok: false, message: "missing" };
  else {
    try { result = await CHECKS[id](r.values, ctx); }
    catch (error) { result = { ok: false, message: `network: ${(error as Error).message}`.slice(0, 300) }; }
  }
  const test = { ...result, at: new Date().toISOString() };
  const stored = await readStored(id);
  if (stored) {
    await db.update(settings).set({ value: { ...stored, test } }).where(eq(settings.key, keyOf(id)));
    cached.delete(id);
  }
  return test;
}

const timeout = () => AbortSignal.timeout(15_000);

export type OpenRouterModel = { id: string; name: string; input: number | null; output: number | null };
type RawModel = { id: string; name?: string; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[];
  architecture?: { input_modalities?: string[]; output_modalities?: string[] } };
/** US dollars per million tokens; null for a model with no fixed price (OpenRouter marks those -1). */
const perMillion = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e8) / 100 : null; };

/**
 * The models that can do a job, free ones first, then by name. "json": read text and answer in JSON on request (the
 * web-reading agent). "tools": read text and call tools (the WhatsApp agent).
 */
export function usableModels(json: unknown, need: "json" | "tools" = "json"): OpenRouterModel[] {
  const free = (m: OpenRouterModel) => (m.input === 0 && m.output === 0 ? 0 : 1);
  const param = need === "tools" ? "tools" : "response_format";
  return ((json as { data?: RawModel[] }).data ?? [])
    .filter((m) => m.architecture?.input_modalities?.includes("text") && m.architecture.output_modalities?.join() === "text" && m.supported_parameters?.includes(param))
    .map((m) => ({ id: m.id, name: m.name ?? m.id, input: perMillion(m.pricing?.prompt), output: perMillion(m.pricing?.completion) }))
    .sort((a, b) => free(a) - free(b) || a.name.localeCompare(b.name));
}

let modelCache: { at: number; raw: unknown } | null = null;

/** OpenRouter's current models (a public list, no key needed), kept for an hour. Empty if OpenRouter cannot be reached. */
export async function openRouterModels(need: "json" | "tools" = "json"): Promise<OpenRouterModel[]> {
  if (!modelCache || Date.now() - modelCache.at >= 3_600_000) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", { cache: "no-store", signal: AbortSignal.timeout(8_000) });
      const raw = res.ok ? await res.json() : null;
      if (raw && usableModels(raw).length) modelCache = { at: Date.now(), raw };
    } catch {
      // keep the last good list
    }
  }
  return modelCache ? usableModels(modelCache.raw, need) : [];
}
const reason = (status: number, json: Record<string, unknown>, ...paths: string[]) => {
  const pick = paths.map((p) => p.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), json))
    .find((v) => typeof v === "string" && v);
  return `${status} ${pick ?? ""}`.trim().slice(0, 300);
};

/** Each check is read-only or harmless: a test email to the admin, a lookup, or (Paymob) an unpaid 1 OMR checkout. */
const CHECKS: Record<IntegrationId, (v: Record<string, string>, ctx: { email: string }) => Promise<{ ok: boolean; message: string }>> = {
  async resend(v, ctx) {
    const res = await fetch("https://api.resend.com/emails", { method: "POST", cache: "no-store", signal: timeout(),
      headers: { Authorization: `Bearer ${v.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: v.from, to: [ctx.email], subject: "Aqar 360: test email", text: "Email sending from Aqar 360 works." }) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, message: `sent:${ctx.email}` } : { ok: false, message: reason(res.status, json, "message", "name") };
  },
  async thawani(v) {
    const host = v.mode === "live" ? "https://checkout.thawani.om" : "https://uatcheckout.thawani.om";
    const res = await fetch(`${host}/api/v1/checkout/session?limit=1&skip=0`, { cache: "no-store", signal: timeout(),
      headers: { "thawani-api-key": v.secretKey } });
    const json = await res.json().catch(() => ({}));
    return res.ok && json.success !== false ? { ok: true, message: `mode:${v.mode}` } : { ok: false, message: reason(res.status, json, "description", "code") };
  },
  async paymob(v) {
    const factor = Number(v.amountFactor) || 1000;
    const ids = v.integrationIds.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (/^\d+$/.test(s) ? Number(s) : s));
    const res = await fetch(`${v.baseUrl.replace(/\/$/, "")}/v1/intention/`, { method: "POST", cache: "no-store", signal: timeout(),
      headers: { "Content-Type": "application/json", Authorization: `Token ${v.secretKey}` },
      body: JSON.stringify({ amount: factor, currency: v.currency, payment_methods: ids,
        items: [{ name: "Aqar 360 connection test", amount: factor, description: "Connection test, not a payment", quantity: 1 }],
        billing_data: { first_name: "Test", last_name: "NA", email: "na@example.com", phone_number: "NA", apartment: "NA", floor: "NA",
          street: "NA", building: "NA", city: "Muscat", state: "NA", country: "OM", postal_code: "NA" },
        special_reference: `aqar-test-${randomBytes(4).toString("hex")}` }) });
    const json = await res.json().catch(() => ({}));
    return res.ok && json.client_secret ? { ok: true, message: `mode:${v.secretKey.includes("_live_") ? "live" : "test"}` }
      : { ok: false, message: reason(res.status, json, "detail", "message", "error") || `${res.status}` };
  },
  async whatsapp(v) {
    const res = await fetch(`https://graph.facebook.com/${v.apiVersion}/${encodeURIComponent(v.phoneNumberId)}?fields=display_phone_number,verified_name`,
      { cache: "no-store", signal: timeout(), headers: { Authorization: `Bearer ${v.token}` } });
    const json = await res.json().catch(() => ({}));
    return res.ok && json.display_phone_number ? { ok: true, message: `number:${json.display_phone_number} ${json.verified_name ?? ""}`.trim() }
      : { ok: false, message: reason(res.status, json, "error.message") };
  },
  async anthropic(v) {
    try {
      const model = await new Anthropic({ apiKey: v.apiKey, maxRetries: 0, timeout: 15_000 }).models.retrieve(v.model);
      return { ok: true, message: `model:${model.display_name}` };
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) return { ok: false, message: "401 API key rejected" };
      if (error instanceof Anthropic.NotFoundError) return { ok: false, message: `404 model ${v.model} not available on this account` };
      if (error instanceof Anthropic.APIError) return { ok: false, message: `${error.status ?? ""} ${error.message}`.trim().slice(0, 300) };
      throw error;
    }
  },
  async openrouter(v) {
    const res = await fetch("https://openrouter.ai/api/v1/key", { cache: "no-store", signal: timeout(), headers: { Authorization: `Bearer ${v.apiKey}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: reason(res.status, json, "error.message") };
    const models = await openRouterModels();
    const model = models.find((m) => m.id === v.model);
    return model || !models.length ? { ok: true, message: `model:${model?.name ?? v.model}` } : { ok: false, message: `404 model ${v.model} is no longer offered` };
  },
};
