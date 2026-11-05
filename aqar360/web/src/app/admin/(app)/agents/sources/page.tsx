import Link from "next/link";

import { dateTime } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { areas } from "@/db/schema";
import { agentSourceList, recentListings } from "@/lib/agent";
import { requireApp } from "@/lib/auth";
import { integrationConfig } from "@/lib/integrations";

import { addSourceForm, removeSourceForm, toggleSourceForm } from "../../../agent-actions";

const TONE: Record<string, string> = { ok: "on", empty: "warn", ai_limit: "warn", robots: "off", blocked: "bad", error: "bad" };

/** The web pages the agent reads and the ads it found on them. Only an admin can add a page. */
export default async function AgentSourcesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.agent;
  const q = await searchParams;
  const admin = user.role === "admin";
  const [sources, ads, areaRows, ai] = await Promise.all([agentSourceList(), recentListings(), db.select().from(areas), integrationConfig("openrouter")]);
  const areaName = (id: number | null) => { const a = areaRows.find((x) => x.id === id); return a ? (lang === "ar" ? a.nameAr : a.nameEn) : "—"; };
  return (
    <>
      <p><Link href="/admin/agents">← {t.title}</Link></p>
      <header className="a-head"><h1>{t.sources}</h1><p className="a-muted">{t.sourcesIntro}</p></header>
      {q.saved && <p className="a-ok">{t.saved}</p>}
      {q.error && <p className="a-alert">{q.error === "address" ? t.badAddress : t.badForm}</p>}
      {ai
        ? <p className="a-muted">{t.aiModel}: <code dir="ltr">{ai.model}</code> {admin && <Link href="/admin/integrations#openrouter">{t.changeModel}</Link>}</p>
        : <p className="a-alert">{t.noAi} {admin && <Link href="/admin/integrations#openrouter">{T.nav.integrations}</Link>}</p>}
      {admin && (
        <section className="a-panel">
          <h2>{t.addSource}</h2>
          <form action={addSourceForm} className="a-form">
            <div className="a-grid-fields">
              <label className="a-field"><span>{t.sourceName}</span><input name="name" required minLength={2} maxLength={80} /></label>
              <label className="a-field"><span>{t.sourceUrl}</span><input name="url" type="url" required dir="ltr" placeholder="https://…" /><small>{t.sourceUrlHelp}</small></label>
            </div>
            <label className="a-toggle"><input type="checkbox" name="confirmed" required /><span><strong>{t.confirm}</strong><small>{t.confirmHelp}</small></span></label>
            <div><button className="a-btn primary">{t.addSource}</button></div>
          </form>
        </section>
      )}
      <section className="a-panel">
        <h2>{t.sources} ({sources.length})</h2>
        {sources.length === 0 ? <p className="a-muted">{t.noSources}</p> : (
          <table className="a-table">
            <thead><tr><th>{t.sourceName}</th><th>{t.lastRead}</th><th>{t.result}</th><th>{t.found}</th><th /></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className={s.active ? "" : "muted"}>
                  <td><a href={s.url} target="_blank" rel="noreferrer noopener">{s.name} ↗</a></td>
                  <td>{s.lastRunAt ? dateTime(s.lastRunAt, lang) : "—"}</td>
                  <td>{s.lastStatus ? <span className={`a-state ${TONE[s.lastStatus] ?? "off"}`}>{t.statuses[s.lastStatus] ?? s.lastStatus}</span> : "—"}
                    {s.lastDetail === "no_ai" ? <small className="a-muted"> {t.needsAi}</small> : s.lastDetail ? <small className="a-muted" dir="ltr"> {s.lastDetail}</small> : null}</td>
                  <td>{s.lastFound}</td>
                  <td>{admin && (
                    <div className="a-actions">
                      <form action={toggleSourceForm}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="active" value={s.active ? "0" : "1"} />
                        <button className="a-btn small">{s.active ? t.pause : t.resume}</button></form>
                      <form action={removeSourceForm}><input type="hidden" name="id" value={s.id} /><button className="a-btn small danger">{t.remove}</button></form>
                    </div>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="a-panel">
        <h2>{t.adsTitle} ({ads.length})</h2>
        {ads.length === 0 ? <p className="a-muted">{t.noAds}</p> : (
          <table className="a-table">
            <thead><tr><th>{t.ad}</th><th>{t.area}</th><th>{t.price}</th><th>{t.seen}</th></tr></thead>
            <tbody>
              {ads.map((a) => (
                <tr key={a.id}>
                  <td><a href={a.url} target="_blank" rel="noreferrer noopener" dir="auto">{a.title || a.url}</a></td>
                  <td>{areaName(a.areaId)}</td>
                  <td dir="ltr">{a.price ?? "—"}{a.previousPrice && a.price ? <small className="a-muted"> ({a.previousPrice})</small> : null}</td>
                  <td>{dateTime(a.lastSeenAt, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
