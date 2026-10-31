import { sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { adminDict, adminLang } from "@/admin/i18n";
import { Field, Section, Toggle } from "@/admin/ListingParts";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { audit, requireApp } from "@/lib/auth";
import { siteUrl } from "@/lib/config";
import { gatewayStatus } from "@/lib/payments";
import { payMethods } from "@/lib/payment-methods";

async function save(form: FormData) {
  "use server";
  const user = await requireApp("erp", ["admin", "manager"]);
  const text = (k: string) => String(form.get(k) ?? "").trim().slice(0, 200);
  const on = (k: string) => form.get(k) === "on";
  const rows = [
    { key: "payBank", value: on("payBank") }, { key: "bankName", value: text("bankName") }, { key: "bankAccountName", value: text("bankAccountName") },
    { key: "bankAccountNumber", value: text("bankAccountNumber") }, { key: "bankIban", value: text("bankIban").replace(/\s/g, "").toUpperCase() },
    { key: "bankSwift", value: text("bankSwift").toUpperCase() }, { key: "payCash", value: on("payCash") }, { key: "payCheque", value: on("payCheque") },
    { key: "chequePayee", value: text("chequePayee") }, { key: "payCard", value: on("payCard") }, { key: "payNoteEn", value: text("payNoteEn") },
    { key: "payNoteAr", value: text("payNoteAr") }, { key: "payThawani", value: on("payThawani") }, { key: "payPaymob", value: on("payPaymob") },
  ];
  await db.insert(settings).values(rows).onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value` } });
  await audit("payment_methods_saved", "settings", null, {}, user.id);
  revalidateTag("aqar-content");
  revalidatePath("/admin/payment-methods");
  redirect("/admin/payment-methods?saved=1");
}

export default async function PaymentMethodsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireApp("erp", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.payMethods;
  const p = T.pay;
  const [m, { saved }] = await Promise.all([payMethods(), searchParams]);
  const status = gatewayStatus();
  return (
    <>
      <header className="a-head"><h1>{t.title}</h1><p className="a-muted">{t.intro}</p></header>
      {saved && <p className="a-ok">{t.saved}</p>}
      <form action={save} className="a-form a-listing-form">
        <Section title={`🏦 ${t.bank}`}>
          <Toggle name="payBank" label={t.accept} checked={m.bank} />
          <div className="a-grid-fields" style={{ marginTop: 12 }}>
            <Field label={t.bankName}><input name="bankName" defaultValue={m.bankName} dir="auto" /></Field>
            <Field label={t.accountName}><input name="bankAccountName" defaultValue={m.accountName} dir="auto" /></Field>
            <Field label={t.accountNumber}><input name="bankAccountNumber" defaultValue={m.accountNumber} dir="ltr" /></Field>
            <Field label={t.iban}><input name="bankIban" defaultValue={m.iban} dir="ltr" placeholder="OM.." /></Field>
            <Field label={t.swift}><input name="bankSwift" defaultValue={m.swift} dir="ltr" /></Field>
          </div>
        </Section>
        <Section title={`💵 ${t.cash} · ${t.cheque} · ${t.card}`}>
          <div className="a-grid-fields">
            <Toggle name="payCash" label={t.cash} checked={m.cash} />
            <Toggle name="payCard" label={t.card} checked={m.card} />
            <Toggle name="payCheque" label={t.cheque} checked={m.cheque} />
            <Field label={t.chequeTo}><input name="chequePayee" defaultValue={m.chequePayee} dir="auto" /></Field>
            <Field label={t.instructionsEn} wide><input name="payNoteEn" defaultValue={m.noteEn} dir="ltr" /></Field>
            <Field label={t.instructionsAr} wide><input name="payNoteAr" defaultValue={m.noteAr} dir="rtl" /></Field>
          </div>
        </Section>
        <Section title={`💳 ${t.online}`}>
          <p className="a-muted">{p.intro}</p>
          <div className="a-gateways">
            {(["thawani", "paymob"] as const).map((g) => (
              <div key={g} className="a-gateway">
                <h3>{p[g]} <span className={`a-state ${status[g].ready ? "on" : "off"}`}>{status[g].ready ? `${p.ready} · ${status[g].live ? p.live : p.test}` : p.notReady}</span></h3>
                <label className="a-toggle"><input type="checkbox" name={g === "thawani" ? "payThawani" : "payPaymob"} defaultChecked={m[g]} />
                  <span>{p.show}</span></label>
                <p className="a-muted">{p.webhook}</p>
                <code dir="ltr" className="a-code">{`${siteUrl}/api/webhooks/${g}`}</code>
                <p className="a-muted">{p.returnUrl}</p>
                <code dir="ltr" className="a-code">{`${siteUrl}/api/pay/return/${g}`}</code>
                {g === "thawani" && status.thawani.ready && !status.thawani.webhook && <p className="a-warn">{p.noWebhookSecret}</p>}
              </div>
            ))}
          </div>
        </Section>
        <div className="a-savebar"><button className="a-btn primary">{t.save}</button></div>
      </form>
    </>
  );
}
