import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerSummary, WaComposer } from "@/admin/AiParts";
import { dateTime, whatsappLink } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { WaPrefs } from "@/admin/WaPrefs";
import { db } from "@/db";
import { contacts, waMessages } from "@/db/schema";
import { aiReady } from "@/lib/ai";
import { requireApp } from "@/lib/auth";
import { botSettings, botState } from "@/lib/wa-agent";
import { waReady, windowOpen } from "@/lib/whatsapp";

import { approveDraft, discardDraft, replyWhatsApp, toggleAgent } from "../../../wa-actions";

const TICKS: Record<string, string> = { sent: "✓", delivered: "✓✓", read: "✓✓ 👁", failed: "⚠" };

/** One WhatsApp conversation, linked to the customer's file; replies within the 24-hour window; the agent's drafts and controls. */
export default async function WhatsAppConversation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ closed?: string }> }) {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const t = adminDict(lang).wa;
  const id = Number((await params).id);
  const [c] = Number.isInteger(id) ? await db.select().from(contacts).where(eq(contacts.id, id)) : [];
  if (!c) notFound();
  const [rows, open, ready, ai, bot, state] = await Promise.all([db.select().from(waMessages).where(eq(waMessages.contactId, c.id)).orderBy(asc(waMessages.createdAt)).limit(300),
    windowOpen(c.id), waReady(), aiReady(), botSettings(), botState(c.id)]);
  const T = adminDict(lang);
  const wa = whatsappLink(c.phone);
  const closedFlag = (await searchParams).closed;
  const drafts = rows.filter((m) => m.status === "draft");
  const thread = rows.filter((m) => m.status !== "draft" && m.status !== "discarded");
  const pausedWhy = state.pausedReason ? t.pausedWhy[state.pausedReason] ?? `${t.handedOver}: ${state.pausedReason}` : "";
  return (
    <>
      <p><Link href="/admin/whatsapp">← {t.title}</Link></p>
      <header className="a-head a-request-head">
        <div><h1>{c.name}</h1><p className="a-muted" dir="ltr">{c.phone}</p></div>
        <Link className="a-btn" href={`/admin/customers/${c.id}`}>{adminDict(lang).crm.openCustomer}</Link>
        {ai && <CustomerSummary t={T.ai} contactId={c.id} />}
      </header>
      {bot.enabled && (
        <section className="a-panel wa-agent">
          <form action={toggleAgent} className="a-actions">
            <input type="hidden" name="contactId" value={c.id} />
            <input type="hidden" name="pause" value={state.paused ? "0" : "1"} />
            <span className={`a-tag${state.paused ? " a-saved" : ""}`}>🤖 {state.paused ? `${t.paused}${pausedWhy ? ` (${pausedWhy})` : ""}` : t.active}</span>
            <button className="a-btn small" type="submit">{state.paused ? t.resume : t.pause}</button>
          </form>
          <details>
            <summary>{t.prefs}</summary>
            <WaPrefs contactId={c.id} lang={lang} state={state} />
          </details>
        </section>
      )}
      <section className="a-panel wa-thread">
        {thread.length === 0 && <p className="a-muted">{t.none}</p>}
        {thread.map((m) => (
          <div key={m.id} className={`wa-msg ${m.direction}${m.bot ? " bot" : ""}`}>
            {m.media.map((ph) => <a key={ph.url} href={ph.url} target="_blank" rel="noreferrer"><img className="wa-photo" src={ph.url} alt={ph.caption ?? ""} loading="lazy" /></a>)}
            {(m.body || m.media[0]?.caption) && <p dir="auto">{m.body || m.media[0]?.caption}</p>}
            <small>{m.bot && `🤖 ${t.bot} · `}{dateTime(m.createdAt, lang)}{m.direction === "out" && ` · ${TICKS[m.status] ?? m.status}`}{m.error && ` · ${m.error}`}</small>
          </div>
        ))}
      </section>
      {drafts.map((d) => (
        <section key={d.id} className="a-panel wa-draft">
          <h2>🤖 {t.draft}</h2>
          <p className="a-muted">{t.draftHelp}</p>
          <form action={approveDraft} className="a-form">
            <input type="hidden" name="contactId" value={c.id} />
            <input type="hidden" name="id" value={d.id} />
            <textarea name="text" rows={Math.min(10, Math.max(3, d.body.split("\n").length + 1))} defaultValue={d.body} dir="auto" maxLength={4000} />
            {d.media.length > 0 && (
              <div className="wa-photos">
                {d.media.map((ph) => (
                  <label key={ph.url} className="wa-pick"><input type="checkbox" name="photo" value={ph.url} defaultChecked />
                    <img src={ph.url} alt={ph.caption ?? ""} loading="lazy" /><small dir="auto">{ph.caption?.split("\n")[0]}</small></label>
                ))}
              </div>
            )}
            <div className="a-actions">
              {ready && open ? <button className="a-btn primary" type="submit">{t.approve}</button> : <span className="a-muted">{ready ? t.windowClosed : t.notConnected}</span>}
              <button className="a-btn" type="submit" formAction={discardDraft}>{t.discard}</button>
            </div>
          </form>
        </section>
      ))}
      <section className="a-panel">
        {closedFlag && <p className="a-alert">{t.windowClosed}</p>}
        {ready && open ? (
          <form action={replyWhatsApp}>
            <input type="hidden" name="contactId" value={c.id} />
            <WaComposer t={T.ai} contactId={c.id} placeholder={t.reply} sendLabel={t.send} ai={ai} />
          </form>
        ) : (
          <p className="a-muted">{ready ? t.windowClosed : t.notConnected}
            {wa && <> <a className="a-btn wa small" href={wa} target="_blank" rel="noreferrer">💬 {t.openApp}</a></>}</p>
        )}
      </section>
    </>
  );
}
