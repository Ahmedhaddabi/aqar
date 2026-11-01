import { dateTime } from "@/admin/format";
import { adminDict, adminLang, fill } from "@/admin/i18n";
import { Field, Toggle } from "@/admin/ListingParts";
import { requireUser } from "@/lib/auth";
import { CALLBACKS, FIELDS, integrationOverview } from "@/lib/integrations";

import { removeIntegrationForm, saveIntegrationForm } from "../../integration-actions";

type Row = Awaited<ReturnType<typeof integrationOverview>>[number];

/** One status word per service: what the admin needs to know at a glance. */
function statusOf(r: Row) {
  if (!r.complete && r.source === "none") return { key: "notSet", tone: "off" };
  if (!r.enabled) return { key: "off", tone: "off" };
  if (!r.complete || r.test?.ok === false) return { key: "failed", tone: "bad" };
  if (r.source === "server") return { key: "server", tone: "on" };
  return r.test?.ok ? { key: "connected", tone: "on" } : { key: "untested", tone: "warn" };
}

/**
 * Admin → Integrations: each outside service is a card (like credentials in n8n). Paste the keys, "Save and test",
 * and the feature turns on across the app. Secret values never come back to the page.
 */
export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; removed?: string; error?: string }> }) {
  const user = await requireUser(["admin"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).integ;
  const [rows, q] = await Promise.all([integrationOverview(), searchParams]);
  const testText = (message: string) => {
    if (message === "missing") return t.missing;
    const [kind, ...rest] = message.split(":");
    return t.testOk[kind] ? fill(t.testOk[kind], { v: rest.join(":") }) : message;
  };
  return (
    <>
      <header className="a-head"><h1>🔌 {t.title}</h1><p className="a-muted">{t.intro}</p></header>
      <p className="a-muted">🔒 {t.security}</p>
      {q.error === "secret" && <p className="a-alert">{t.noSecretKey}</p>}
      <nav className="a-integ-index" aria-label={t.title}>
        {rows.map((r) => {
          const s = statusOf(r);
          const p = t.providers[r.id];
          return <a key={r.id} href={`#${r.id}`}><span aria-hidden="true">{p.icon}</span>{p.name}<span className={`a-state ${s.tone}`}>{t.status[s.key]}</span></a>;
        })}
      </nav>
      {rows.map((r) => {
        const p = t.providers[r.id];
        const s = statusOf(r);
        return (
          <section key={r.id} id={r.id} className="a-panel a-integ">
            <h2><span aria-hidden="true">{p.icon}</span> {p.name} <span className={`a-state ${s.tone}`}>{t.status[s.key]}</span></h2>
            <p className="a-muted">{p.purpose}</p>
            {q.saved === r.id && <p className="a-ok">{t.saved}</p>}
            {q.removed === r.id && <p className="a-ok">{t.removed}</p>}
            {r.test && (
              <p className={r.test.ok ? "a-ok-text" : "a-warn"}>
                {r.test.ok ? "✓" : "✗"} {t.lastTest} ({dateTime(r.test.at, lang)}): <span dir="auto">{testText(r.test.message)}</span>
              </p>
            )}
            {r.source === "server" && <p className="a-muted">ℹ️ {t.serverKeys}</p>}
            {r.unreadable.length > 0 && <p className="a-alert">{t.unreadable}</p>}

            <details className="a-integ-help" open={s.key === "notSet"}>
              <summary>{t.howTo}</summary>
              <ol>{p.steps.split("|").map((step) => <li key={step} dir="auto">{step}</li>)}</ol>
              <p><a href={p.link} target="_blank" rel="noreferrer">{t.openSite} ↗</a></p>
            </details>

            {CALLBACKS[r.id].length > 0 && (
              <div className="a-integ-urls">
                <p className="a-muted">{t.addresses}</p>
                {CALLBACKS[r.id].map((url) => <code key={url} dir="ltr" className="a-code">{url}</code>)}
                {r.id === "whatsapp" && r.plain.verifyToken && <code dir="ltr" className="a-code">verify token: {r.plain.verifyToken}</code>}
              </div>
            )}

            <form action={saveIntegrationForm} className="a-form" autoComplete="off">
              <input type="hidden" name="id" value={r.id} />
              <div className="a-grid-fields">
                {FIELDS[r.id].map((f) => {
                  const label = `${p.fields[f.name] ?? f.name}${f.required ? ` (${t.required})` : ""}`;
                  if (f.options) {
                    return (
                      <Field key={f.name} label={label} help={p.help[f.name]}>
                        <select name={f.name} defaultValue={r.plain[f.name] || f.default}>
                          {f.options.map((o) => <option key={o} value={o}>{p.options[o] ?? o}</option>)}
                        </select>
                      </Field>
                    );
                  }
                  if (f.secret) {
                    const hint = r.hints[f.name];
                    return (
                      <Field key={f.name} label={label} help={p.help[f.name]}>
                        <input name={f.name} type="password" dir="ltr" autoComplete="new-password" spellCheck={false}
                          placeholder={hint ? fill(t.keep, { hint }) : f.placeholder} />
                        {hint && r.source === "app" && <label className="a-check"><input type="checkbox" name="clear" value={f.name} /> {t.clear}</label>}
                      </Field>
                    );
                  }
                  return (
                    <Field key={f.name} label={label} help={p.help[f.name]}>
                      <input name={f.name} defaultValue={r.plain[f.name]} dir="ltr" placeholder={f.placeholder} spellCheck={false}
                        inputMode={f.numeric ? "numeric" : undefined} />
                    </Field>
                  );
                })}
              </div>
              <div style={{ marginTop: 12 }}>
                <Toggle name="enabled" label={t.enabled} help={t.enabledHelp} checked={r.source === "none" ? true : r.enabled} />
              </div>
              <p className="a-muted">{p.test}</p>
              <div className="a-inline">
                <button className="a-btn primary" name="intent" value="test">{t.saveTest}</button>
                <button className="a-btn" name="intent" value="save">{t.save}</button>
              </div>
            </form>

            {r.source === "app" && (
              <details className="a-integ-remove">
                <summary>{t.remove}</summary>
                <form action={removeIntegrationForm}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="a-btn small danger">{t.removeConfirm}</button>
                </form>
              </details>
            )}
            {r.updatedAt && <p className="a-muted"><small>{dateTime(r.updatedAt, lang)}</small></p>}
          </section>
        );
      })}
    </>
  );
}
