import Link from "next/link";

import { addActivity, completeActivity } from "@/app/admin/crm-actions";
import { setViewingResult } from "@/app/admin/deal-actions";
import type { timelineFor } from "@/admin/crm";

import { dateTime } from "./format";
import type { AdminDict, AdminLang } from "./i18n";

type Rows = Awaited<ReturnType<typeof timelineFor>>;
const ADD_TYPES = ["note", "call", "whatsapp", "email", "follow_up", "viewing"] as const;

/** Add-to-timeline form plus the history, newest first. Follow-ups and viewings carry a date and a "done" tick. */
export function Timeline({ rows, t, lang, contactId, requestId, showRequest, results }: {
  rows: Rows; t: AdminDict["crm"]; lang: AdminLang; contactId: number; requestId?: number; showRequest?: boolean;
  results?: AdminDict["match"];
}) {
  const describe = (type: string, body: string) => {
    if (type === "system") return t.systemEvents[body.split(":")[0]] ?? body;
    if (type === "status") {
      const [change, reason] = body.split("|");
      const [from, to] = change.split(">");
      return `${t.statuses[from] ?? from} → ${t.statuses[to] ?? to}${reason ? ` — ${reason}` : ""}`;
    }
    return body;
  };
  return (
    <section className="a-panel">
      <h2>{t.timeline}</h2>
      <form action={addActivity} className="a-form a-timeline-form">
        <input type="hidden" name="contactId" value={contactId} />
        {requestId && <input type="hidden" name="requestId" value={requestId} />}
        <div className="a-inline">
          <select name="type" defaultValue="call" aria-label={t.addNote}>
            {ADD_TYPES.map((type) => <option key={type} value={type}>{t.activityTypes[type]}</option>)}
          </select>
          <label className="a-inline a-muted">{t.when} <input type="datetime-local" name="dueAt" /></label>
        </div>
        <textarea name="body" rows={2} placeholder={t.noteText} aria-label={t.noteText} />
        <div><button className="a-btn primary">{t.addNote}</button></div>
      </form>
      <ol className="a-timeline">
        {rows.map(({ activity: a, author, requestNumber }) => (
          <li key={a.id} className={`t-${a.type}${a.dueAt && !a.done ? " open" : ""}`}>
            <div className="a-timeline-head">
              <strong>{t.activityTypes[a.type]}</strong>
              <span className="a-muted">{dateTime(a.createdAt, lang)}{author ? ` · ${author}` : ""}</span>
              {showRequest && requestNumber && a.requestId && <Link href={`/admin/requests/${a.requestId}`} className="a-muted">{requestNumber}</Link>}
            </div>
            {a.type === "viewing" && a.source === "online" && results && <p className="a-tag">🌐 {results.online}</p>}
            {a.type === "viewing" && results && (a.result ? <p className="a-tag">{a.result === "cancelled" ? results.cancelled : results.results[a.result] ?? a.result}</p> : (
              <form action={setViewingResult} className="a-inline">
                <input type="hidden" name="id" value={a.id} />
                <select name="result" aria-label={results.result}>
                  {Object.entries(results.results).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <button className="a-btn small">{results.saveResult}</button>
              </form>
            ))}
            {a.dueAt && (
              <div className="a-due">
                🗓 {dateTime(a.dueAt, lang)}{" "}
                {a.done ? <span className="a-state on">{t.done}</span> : (
                  <form action={completeActivity} className="a-inline-form">
                    <input type="hidden" name="id" value={a.id} />
                    <button className="a-btn small">{t.markDone}</button>
                  </form>
                )}
              </div>
            )}
            {describe(a.type, a.body) && <p>{describe(a.type, a.body)}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
