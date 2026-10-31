import { desc } from "drizzle-orm";
import Link from "next/link";

import { dateTime } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { outbox } from "@/db/schema";
import { requireApp } from "@/lib/auth";
import { DEFAULT_TEMPLATES, getTemplate, TEMPLATE_KEYS } from "@/lib/messages";

import { restoreTemplate, saveTemplate } from "../../message-actions";

const placeholders = (key: (typeof TEMPLATE_KEYS)[number]) => {
  const d = DEFAULT_TEMPLATES[key].en;
  return [...new Set([...`${d.subject} ${d.body}`.matchAll(/\{\{(\w+)\}\}/g)].map((m) => `{{${m[1]}}}`))];
};

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).msgs;
  const tab = (await searchParams).tab === "log" ? "log" : "templates";
  return (
    <>
      <header className="a-head"><h1>{t.title}</h1><p className="a-muted">{t.intro}</p></header>
      {!process.env.RESEND_API_KEY && <p className="a-alert">{t.noProvider}</p>}
      <nav className="a-tabs a-toolbar">
        {(["templates", "log"] as const).map((k) => <Link key={k} href={`/admin/messages?tab=${k}`} aria-current={k === tab ? "page" : undefined}>{t.tabs[k]}</Link>)}
      </nav>
      {tab === "templates" ? (
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
