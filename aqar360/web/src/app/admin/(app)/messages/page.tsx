import { desc } from "drizzle-orm";
import Link from "next/link";

import { dateTime } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { outbox, waTemplates } from "@/db/schema";
import { requireApp } from "@/lib/auth";
import { siteUrl } from "@/lib/config";
import { integrationConfig } from "@/lib/integrations";
import { DEFAULT_TEMPLATES, getTemplate, TEMPLATE_KEYS } from "@/lib/messages";
import { waConfig, waReady } from "@/lib/whatsapp";

import { restoreTemplate, saveTemplate } from "../../message-actions";
import { saveWaTemplate } from "../../wa-actions";

const placeholders = (key: (typeof TEMPLATE_KEYS)[number]) => {
  const d = DEFAULT_TEMPLATES[key].en;
  return [...new Set([...`${d.subject} ${d.body}`.matchAll(/\{\{(\w+)\}\}/g)].map((m) => `{{${m[1]}}}`))];
};

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).msgs;
  const raw = (await searchParams).tab;
  const tab = raw === "log" ? "log" : raw === "whatsapp" ? "whatsapp" : "templates";
  return (
    <>
      <header className="a-head"><h1>{t.title}</h1><p className="a-muted">{t.intro}</p></header>
      {!(await integrationConfig("resend")) && <p className="a-alert">{t.noProvider} <Link href="/admin/integrations#resend">{adminDict(lang).integ.open}</Link></p>}
      <nav className="a-tabs a-toolbar">
        {(["templates", "whatsapp", "log"] as const).map((k) => <Link key={k} href={`/admin/messages?tab=${k}`} aria-current={k === tab ? "page" : undefined}>{k === "whatsapp" ? "WhatsApp" : t.tabs[k]}</Link>)}
      </nav>
      {tab === "whatsapp" ? <WhatsAppSetup lang={lang} /> : tab === "templates" ? (
        await Promise.all(TEMPLATE_KEYS.map(async (key) => {
          const [ar, en] = await Promise.all([getTemplate(key, "ar"), getTemplate(key, "en")]);
          return (
            <section className="a-panel" key={key} id={key}>
              <h2>{t.keys[key]}</h2>
              <p className="a-muted">{t.placeholders} <span dir="ltr">{placeholders(key).join("  ")}</span></p>
              <form action={saveTemplate} className="a-form">
                <input type="hidden" name="key" value={key} />
                <div className="a-two-lang">
                  <div>
                    <h3>{t.arabic}</h3>
                    <label className="a-field"><span>{t.subject}</span><input name="subjectAr" defaultValue={ar.subject} dir="rtl" required /></label>
                    <label className="a-field"><span>{t.body}</span><textarea name="bodyAr" rows={5} defaultValue={ar.body} dir="rtl" required /></label>
                  </div>
                  <div>
                    <h3>{t.english}</h3>
                    <label className="a-field"><span>{t.subject}</span><input name="subjectEn" defaultValue={en.subject} dir="ltr" required /></label>
                    <label className="a-field"><span>{t.body}</span><textarea name="bodyEn" rows={5} defaultValue={en.body} dir="ltr" required /></label>
                  </div>
                </div>
                <div className="a-inline">
                  <button className="a-btn primary">{t.save}</button>
                  <button className="a-btn small" formAction={restoreTemplate} formNoValidate>{t.reset}</button>
                </div>
              </form>
            </section>
          );
        }))
      ) : (
        <section className="a-panel">
          {await (async () => {
            const rows = await db.select().from(outbox).orderBy(desc(outbox.createdAt)).limit(200);
            if (!rows.length) return <p className="a-muted">{t.none}</p>;
            return (
              <table className="a-table">
                <thead><tr><th>{t.when}</th><th>{t.to}</th><th>{t.message}</th><th>{t.status}</th></tr></thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td data-label={t.when}>{dateTime(m.createdAt, lang)}</td>
                      <td data-label={t.to}>{m.contactId ? <Link href={`/admin/customers/${m.contactId}`} dir="ltr">{m.recipient ?? "—"}</Link> : m.recipient}</td>
                      <td data-label={t.message}><strong>{t.keys[m.templateKey] ?? m.templateKey}</strong><div className="a-muted" dir="auto">{m.subject}</div></td>
                      <td data-label={t.status}><span className={`a-status ${m.status === "sent" ? "s-won" : m.status === "failed" ? "s-new" : "s-closed"}`}>
                        {t.statuses[m.status]}</span>{m.reason && <div className="a-muted">{t.reasons[m.reason] ?? m.reason}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </section>
      )}
    </>
  );
}

/** WhatsApp connection status, the addresses for Meta's dashboard, and which approved template each message uses. */
async function WhatsAppSetup({ lang }: { lang: "ar" | "en" }) {
  const w = adminDict(lang).wa;
  const t = adminDict(lang).msgs;
  const rows = await db.select().from(waTemplates);
  const [c, ready] = await Promise.all([waConfig(), waReady()]);
  return (
    <>
      <section className="a-panel">
        <h2>WhatsApp <span className={`a-state ${ready ? "on" : "off"}`}>{ready ? w.connected : w.notConnectedShort}</span></h2>
        <p className="a-muted">{w.setupIntro}</p>
        <p className="a-muted">{w.webhook}</p>
        <code dir="ltr" className="a-code">{`${siteUrl}/api/webhooks/whatsapp`}</code>
        {!c.appSecret && ready && <p className="a-warn">{w.noSecret}</p>}
        <p><Link className="a-btn small" href="/admin/integrations#whatsapp">{adminDict(lang).integ.open}</Link></p>
      </section>
      <section className="a-panel">
        <h2>{w.templates}</h2>
        <p className="a-muted">{w.templatesIntro}</p>
        <table className="a-table">
          <thead><tr><th>{t.message}</th><th>{w.templateName}</th><th>{w.params}</th><th /></tr></thead>
          <tbody>
            {TEMPLATE_KEYS.map((key) => {
              const row = rows.find((r) => r.key === key);
              const hint = [...new Set([...`${DEFAULT_TEMPLATES[key].en.body}`.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].join(", ");
              return (
                <tr key={key}>
                  <td data-label={t.message}><strong>{t.keys[key]}</strong></td>
                  <td colSpan={3}>
                    <form action={saveWaTemplate} className="a-inline">
                      <input type="hidden" name="key" value={key} />
                      <input name="name" defaultValue={row?.name ?? ""} placeholder="aqar_request_received" dir="ltr" aria-label={w.templateName} pattern="[a-z0-9_]*" />
                      <input name="params" defaultValue={row?.params.join(", ") ?? ""} placeholder={hint} dir="ltr" aria-label={w.params} />
                      <label className="a-check"><input type="checkbox" name="enabled" defaultChecked={row?.enabled ?? false} /> {w.enabled}</label>
                      <button className="a-btn small">{t.save}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
