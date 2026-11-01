// Checks Admin → Integrations end to end against the database: encryption at rest, keep/clear of secrets, on/off,
// the modules reading the saved keys, webhook signatures, and each provider rejecting fake keys.
// Writes temporary integration:* rows and removes them at the end. Run: npm run test:integrations
import "./test-guard.mts";
import { createHmac } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { aiReady } from "@/lib/ai";
import { INTEGRATIONS, integrationConfig, integrationOverview, removeIntegration, saveIntegration, testIntegration } from "@/lib/integrations";
import { gatewayStatus } from "@/lib/payments";
import { paymobConfig, verifyPaymobRedirect } from "@/lib/payments/paymob";
import { thawaniConfig, validThawaniSignature } from "@/lib/payments/thawani";
import { validSignature, waConfig, waReady } from "@/lib/whatsapp";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const before = await integrationOverview();
if (before.some((r) => r.source === "app")) {
  console.log("Integrations are already saved in this database; not touching them.");
  process.exit(1);
}
check("nothing saved yet", before.every((r) => r.source !== "app"));

try {
  // Encryption at rest and keep / clear of secret fields.
  await saveIntegration("resend", { apiKey: "re_fake_key_ABCD1234", from: "Aqar 360 <noreply@example.com>" }, [], true);
  const [raw] = await db.select().from(settings).where(eq(settings.key, "integration:resend"));
  const rawText = JSON.stringify(raw.value);
  check("secret is encrypted in the database", !rawText.includes("re_fake_key_ABCD1234") && rawText.includes("enc:"));
  check("plain field stored as text", rawText.includes("noreply@example.com"));
  check("saved keys are used", (await integrationConfig("resend"))?.apiKey === "re_fake_key_ABCD1234");
  await saveIntegration("resend", { apiKey: "", from: "Aqar 360 <noreply@example.com>" }, [], true);
  check("empty secret keeps the saved one", (await integrationConfig("resend"))?.apiKey === "re_fake_key_ABCD1234");
  const overview = (await integrationOverview()).find((r) => r.id === "resend")!;
  check("page sees only the last 4 characters", overview.hints.apiKey === "••••1234" && !JSON.stringify(overview).includes("re_fake_key"));
  await saveIntegration("resend", { apiKey: "", from: "Aqar 360 <noreply@example.com>" }, [], false);
  check("switched off: feature hidden", (await integrationConfig("resend")) === null);
  await saveIntegration("resend", { apiKey: "", from: "Aqar 360 <noreply@example.com>" }, ["apiKey"], true);
  check("cleared secret: feature hidden", (await integrationConfig("resend")) === null);
  check("invalid option ignored", (await saveIntegration("thawani", { mode: "hacker", secretKey: "x", publishableKey: "y" }, [], true)).values.mode === "test");

  // WhatsApp: generated verify token, async signature check.
  await saveIntegration("whatsapp", { token: "EAAfake", phoneNumberId: "123", appSecret: "app-secret-1" }, [], true);
  const wa = await waConfig();
  check("whatsapp on with saved keys", (await waReady()) && wa.token === "EAAfake" && wa.version === "v23.0");
  check("verify token generated", wa.verifyToken.length >= 20);
  const body = '{"entry":[]}';
  const sig = `sha256=${createHmac("sha256", "app-secret-1").update(body).digest("hex")}`;
  check("whatsapp signature accepted", await validSignature(body, sig));
  check("whatsapp wrong signature refused", !(await validSignature(body, sig.replace(/.$/, "0"))));

  // Thawani and Paymob signatures read the saved secrets.
  await saveIntegration("thawani", { mode: "test", secretKey: "sk", publishableKey: "pk", webhookSecret: "wh-secret" }, [], true);
  const tsig = createHmac("sha256", "wh-secret").update(`${body}-1700000000`).digest("hex");
  check("thawani signature accepted", await validThawaniSignature(body, tsig, "1700000000"));
  check("thawani wrong signature refused", !(await validThawaniSignature(body, tsig, "1700000001")));
  check("thawani test mode host", (await thawaniConfig()).host.includes("uatcheckout"));
  await saveIntegration("paymob", { secretKey: "omn_sk_test_x", publicKey: "pk", hmacSecret: "hmac-1", integrationIds: "111, 222" }, [], true);
  const pc = await paymobConfig();
  check("paymob ids and defaults", pc.integrationIds.join() === "111,222" && pc.factor === 1000 && pc.base === "https://oman.paymob.com");
  const q = new URLSearchParams({ amount_cents: "5000", created_at: "t", currency: "OMR", error_occured: "false", has_parent_transaction: "false",
    id: "9", integration_id: "111", is_3d_secure: "true", is_auth: "false", is_capture: "false", is_refunded: "false", is_standalone_payment: "true",
    is_voided: "false", order: "7", owner: "1", pending: "false", "source_data.pan": "1234", "source_data.sub_type": "Visa", "source_data.type": "card",
    success: "true", merchant_order_id: "INV-1" });
  const fields = ["amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id", "is_3d_secure", "is_auth",
    "is_capture", "is_refunded", "is_standalone_payment", "is_voided", "order", "owner", "pending", "source_data.pan", "source_data.sub_type",
    "source_data.type", "success"];
  q.set("hmac", createHmac("sha512", "hmac-1").update(fields.map((f) => q.get(f)).join("")).digest("hex"));
  check("paymob signed return accepted", (await verifyPaymobRedirect(q))?.reference === "INV-1");
  q.set("amount_cents", "1");
  check("paymob tampered return refused", (await verifyPaymobRedirect(q)) === null);
  const gs = await gatewayStatus();
  check("both gateways ready", gs.thawani.ready && gs.paymob.ready && !gs.paymob.live);

  // AI on/off follows the saved key.
  await saveIntegration("anthropic", { apiKey: "sk-ant-fake", model: "claude-haiku-5-5", perHour: "5" }, [], false);
  check("ai off while switched off", !(await aiReady()));
  await saveIntegration("anthropic", { apiKey: "", model: "claude-haiku-5-5", perHour: "5" }, [], true);
  check("ai on with saved key", await aiReady());

  // Each provider must reject fake keys (real network calls, nothing is sent or charged).
  await saveIntegration("resend", { apiKey: "re_fake_key_ABCD1234", from: "Aqar 360 <noreply@example.com>" }, [], true);
  for (const id of INTEGRATIONS) {
    const r = await testIntegration(id, { email: "nobody@example.com" });
    check(`${id}: fake keys rejected by the provider`, !r.ok, r.message);
    console.log(`      ${id} said: ${r.message}`);
  }
  const tested = await integrationOverview();
  check("test results kept for the page", tested.every((r) => r.test && r.test.ok === false));
} finally {
  for (const id of INTEGRATIONS) await removeIntegration(id);
}
check("temporary rows removed", (await integrationOverview()).every((r) => r.source !== "app"));
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
