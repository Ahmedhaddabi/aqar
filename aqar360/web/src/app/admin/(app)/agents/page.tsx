import Link from "next/link";

import { dateTime } from "@/admin/format";
import { adminDict, adminLang, fill } from "@/admin/i18n";
import { Ic } from "@/admin/icons";
import { AGENT_ACTIONS, agentInbox, agentOpenCount, lastAgentRun } from "@/lib/agent";
import { requireApp } from "@/lib/auth";

import { decideForm, runAgentForm } from "../../agent-actions";

const TABS = ["new", "done", "dismissed"] as const;

/** What the agent noticed. Every suggestion says why and offers buttons; nothing happens until a person presses one. */
export default async function AgentPage({ searchParams }: { searchParams: Promise<{ tab?: string; ran?: string }> }) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.agent;
  const q = await searchParams;
  const tab = TABS.find((x) => x === q.tab) ?? "new";
  const [rows, open, run] = await Promise.all([agentInbox(tab), agentOpenCount(), lastAgentRun()]);
  const stats = run?.stats ?? {};
  const cards: [string, number][] = [[t.waiting, open], [t.adsFound, stats.ads ?? 0], [t.newAds, stats.added ?? 0], [t.refused, stats.refused ?? 0]];
  return (
    <>
      <section className="a-band">
        <div className="a-band-grid" />
        <div className="a-bandrow">
          <div>
            <span className="a-chip"><i />{run ? `${t.lastRun}: ${dateTime(run.finishedAt ?? run.startedAt, lang)}` : t.neverRun}</span>
            <h1>{t.title}</h1>
            <p>{t.intro}</p>
          </div>
          <div className="a-inline">
            <form action={runAgentForm}><button className="a-btn primary"><Ic name="refresh" size={16} /> {t.runNow}</button></form>
            <Link className="a-btn" href="/admin/agents/sources">{t.sources}</Link>
          </div>
        </div>
        <div className="a-cards">{cards.map(([label, value]) => <div className="a-card" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
      </section>
      {q.ran && <p className="a-ok">{t.ran}</p>}
      <nav className="a-tabs" aria-label={t.title}>
        {TABS.map((x) => <Link key={x} href={`/admin/agents?tab=${x}`} aria-current={x === tab ? "page" : undefined}>{t.tabs[x]}</Link>)}
      </nav>
      {rows.length === 0 ? <section className="a-panel"><p className="a-muted">{tab === "new" ? t.empty : t.none}</p></section> : (
        <ul className="a-sugs">
          {rows.map((s) => {
            const text = t.kinds[s.kind];
            const d = s.data;
            const area = String((lang === "ar" ? d.areaAr : d.areaEn) ?? "");
            const vars = { ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, String(v ?? "")])), area };
            const reasons = Array.isArray(d.reasons) ? d.reasons : [];
            const actions = AGENT_ACTIONS[s.kind] ?? [];
            return (
              <li key={s.id} className="a-panel a-sug">
                <div className="a-grow">
                  <strong>{fill(text?.title ?? s.kind, vars)}</strong>
                  <p className="a-muted">{fill(text?.body ?? "", vars)}</p>
                  {reasons.length > 0 && <p className="a-sug-why">{reasons.map((r) => {
                    const [key, n] = r.split(":");
                    return <span key={r} className="a-tag">{fill(T.match.reasons[key] ?? key, { n: n ?? "" })}</span>;
                  })}</p>}
                  {s.kind === "market_fit" && <p className="a-muted a-sug-note">{t.notVerified}</p>}
                </div>
                <div className="a-actions">
                  {s.requestId && <Link className="a-btn small" href={`/admin/requests/${s.requestId}`}>{t.openRequest}</Link>}
                  {s.propertyId && <Link className="a-btn small" href={`/admin/properties/${s.propertyId}`}>{t.openProperty}</Link>}
                  {typeof d.url === "string" && <a className="a-btn small" href={d.url} target="_blank" rel="noreferrer noopener">{t.openAd} ↗</a>}
                  {s.kind === "demand_gap" && <Link className="a-btn small" href="/admin/market">{T.nav.market}</Link>}
                  {tab === "new" && [...actions, "done" as const, "dismiss" as const].map((a) => (
                    <form action={decideForm} key={a}>
                      <input type="hidden" name="id" value={s.id} /><input type="hidden" name="action" value={a} />
                      <button className={a === "done" || a === "dismiss" ? "a-btn small" : "a-btn small primary"}>{t.actions[a]}</button>
                    </form>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
