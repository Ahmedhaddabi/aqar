import Link from "next/link";

import { ago } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { Field, Toggle } from "@/admin/ListingParts";
import { ModelPicker } from "@/admin/ModelPicker";
import { requireApp } from "@/lib/auth";
import { integrationConfig, openRouterModels } from "@/lib/integrations";
import { botSettings, draftsWaiting } from "@/lib/wa-agent";
import { conversations, waReady } from "@/lib/whatsapp";

import { saveAgentSettings } from "../../wa-actions";

/** WhatsApp inbox: every customer conversation, newest first, with the number of unanswered messages and the agent's drafts. */
export default async function WhatsAppInbox({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const d = adminDict(lang);
  const t = d.wa;
  const q = await searchParams;
  const canSet = user.role === "admin" || user.role === "manager";
  const [rows, bot, drafts, ready, ai, models] = await Promise.all([conversations(), botSettings(), draftsWaiting(), waReady(),
    integrationConfig("openrouter"), canSet ? openRouterModels("tools") : Promise.resolve([])]);
  return (
    <>
      <header className="a-head"><h1>💬 {t.title}</h1><p className="a-muted">{t.intro}</p>
        <p><span className={`a-tag${bot.enabled ? "" : " a-saved"}`}>🤖 {bot.enabled ? `${t.agentStatusOn} · ${bot.mode === "auto" ? t.modeAuto : t.modeApprove}` : t.agentStatusOff}</span></p>
      </header>
      {!ready && <p className="a-alert">{t.notConnected}</p>}
      {q.saved && <p className="a-ok" role="status">{t.saved}</p>}
      {q.error && <p className="a-alert" role="alert">{d.site.invalid}</p>}
      <section className="a-panel">
        {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <ul className="a-list">
            {rows.map(({ contact, last, unread }) => (
              <li key={contact.id} className={unread ? "a-unread" : ""}>
                <Link href={`/admin/whatsapp/${contact.id}`}><strong>{contact.name}</strong> <span className="a-muted" dir="ltr">{contact.phone}</span>
                  {unread > 0 && <span className="a-badge-inline">{unread}</span>}
                  {drafts.has(contact.id) && <span className="a-tag">🤖 {t.draft}</span>}</Link>
                <span className="a-muted" dir="auto">{last.direction === "out" ? (last.bot ? "🤖 " : "➡ ") : "⬅ "}{last.body.slice(0, 120) || (last.media.length ? "📷" : "")} · {ago(last.createdAt, lang)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {canSet && (
        <section className="a-panel">
          <h2>🤖 {t.agent}</h2>
          <p className="a-muted">{t.agentIntro}</p>
          {!ai && <p className="a-alert">{t.aiMissing}</p>}
          <form action={saveAgentSettings} className="a-form">
            <Toggle name="enabled" label={t.agentOn} checked={bot.enabled} />
            <Field label={t.mode}>
              <select name="mode" defaultValue={bot.mode}><option value="approve">{t.modeApprove}</option><option value="auto">{t.modeAuto}</option></select>
            </Field>
            <Field label={t.hours}>
              <select name="hours" defaultValue={bot.hours}><option value="always">{t.hoursAlways}</option><option value="after_hours">{t.hoursAfter}</option></select>
            </Field>
            <Field label={t.dailyCap}><input type="number" name="dailyCap" min={10} max={5000} defaultValue={bot.dailyCap} required /></Field>
            <Field label={t.delay} help={t.delayHelp}><input type="number" name="delay" min={0} max={60} defaultValue={bot.delay} required /></Field>
            <Field label={`${t.instructions} · ${bot.customInstructions ? t.customised : t.defaults}`} help={t.instructionsHelp} wide>
              <textarea name="instructions" rows={14} maxLength={6000} defaultValue={bot.instructions} dir="auto" />
            </Field>
            {bot.customInstructions && <Toggle name="reset" label={t.reset} checked={false} />}
            <Field label={t.avoid} help={t.avoidHelp} wide>
              <textarea name="avoid" rows={4} maxLength={3000} defaultValue={bot.avoid} dir="auto" />
            </Field>
            <Field label={t.model} help={models.length ? t.modelHelp : d.integ.modelPicker.failed} wide>
              {models.length ? <ModelPicker name="model" value={bot.model || ai?.model || ""} models={models} t={d.integ.modelPicker} />
                : <input name="model" defaultValue={bot.model} dir="ltr" spellCheck={false} placeholder={ai?.model ?? ""} />}
            </Field>
            <p className="a-muted"><small>{t.privacy}</small></p>
            <div className="a-actions"><button className="a-btn primary" type="submit">{t.save}</button></div>
          </form>
        </section>
      )}
    </>
  );
}
