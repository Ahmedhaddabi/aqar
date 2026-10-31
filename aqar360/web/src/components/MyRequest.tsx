"use client";

import { type FormEvent, useState } from "react";

import { type Dictionary, optionLabel } from "@/i18n/dictionaries";

type View = {
  request_number: string; request_type: string; status: string; budget_max?: number; timing?: string;
  notes?: string; alerts_paused?: boolean; areas?: string[]; purpose?: string; property_type?: string;
};

const TIMINGS = ["Immediately", "Within 1 Month", "1-3 Months", "3-6 Months", "Not Urgent"];

/** Status, edits, pause/resume/close and stop-alerts for one request, via its private link. */
export function MyRequest({ token, initial, dict }: { token: string; initial: View; dict: Dictionary }) {
  const t = dict.pages.myRequest;
  const [view, setView] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/my-request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...body }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || dict.form.unknownError);
      if (json.data?.request_number) setView(json.data);
      if (body.action === "stop_alerts") setView((v) => ({ ...v, alerts_paused: true }));
      setMessage(done);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : dict.form.unknownError);
    } finally {
      setBusy(false);
    }
  }

  const onSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const changes: Record<string, unknown> = { action: "update" };
    const budget = String(data.get("budget_max") || "").trim();
    if (budget) changes.budget_max = Number(budget);
    if (data.get("timing")) changes.timing = data.get("timing");
    changes.notes = String(data.get("notes") || "");
    send(changes, t.saved);
  };

  const editable = view.request_type === "search";
  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="card">
        <p>{t.number}: <span className="request-number">{view.request_number}</span></p>
        <p>{t.status}: <strong>{view.status}</strong></p>
        {view.purpose && <p>{optionLabel(dict, view.purpose)} · {optionLabel(dict, view.property_type || "")}
          {view.areas?.length ? ` · ${view.areas.join("، ")}` : ""}</p>}
        {view.alerts_paused && <p className="muted">{t.alertsPaused}</p>}
      </div>
      {message && <div className="notice" role="status">{message}</div>}
      {editable && (
        <form className="card intake" onSubmit={onSave}>
          <h2>{t.update}</h2>
          <div className="fields">
            <div className="field">
              <label htmlFor="budget_max">{t.budgetMax}</label>
              <input id="budget_max" name="budget_max" type="number" min={0} defaultValue={view.budget_max ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="timing">{t.timing}</label>
              <select id="timing" name="timing" defaultValue={view.timing || ""}>
                {TIMINGS.map((v) => <option key={v} value={v}>{optionLabel(dict, v)}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="notes">{t.notes}</label>
            <textarea id="notes" name="notes" maxLength={1000} defaultValue={view.notes || ""} />
          </div>
          <div className="actions">
            <button className="btn primary" disabled={busy}>{t.save}</button>
            <button type="button" className="btn secondary" disabled={busy}
              onClick={() => send({ action: "update", state: "pause" }, t.saved)}>{t.pause}</button>
            <button type="button" className="btn secondary" disabled={busy}
              onClick={() => send({ action: "update", state: "resume" }, t.saved)}>{t.resume}</button>
            <button type="button" className="btn secondary" disabled={busy}
              onClick={() => window.confirm(t.confirmClose) && send({ action: "update", state: "close" }, t.saved)}>{t.close}</button>
          </div>
        </form>
      )}
      <div>
        <button className="btn secondary" disabled={busy || view.alerts_paused}
          onClick={() => send({ action: "stop_alerts" }, t.stopped)}>{t.stopAlerts}</button>
      </div>
    </div>
  );
}
