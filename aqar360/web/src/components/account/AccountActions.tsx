"use client";

import { useState } from "react";

import { type Dictionary, optionLabel } from "@/i18n/dictionaries";

type Preference = { purpose: string; channel: string; granted: boolean };

/** Optional-message preferences (withdraw only; granting needs the approved wording on a form) and sign-out. */
export function AccountActions({ dict, preferences }: { dict: Dictionary; preferences: Preference[] }) {
  const t = dict.pages.account;
  const [prefs, setPrefs] = useState(preferences);
  const [message, setMessage] = useState<string | null>(null);

  async function call(body: Record<string, string>) {
    const res = await fetch("/api/account", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return res.json().catch(() => ({ ok: false }));
  }

  async function withdraw(p: Preference) {
    const result = await call({ action: "withdraw", purpose: p.purpose, channel: p.channel });
    if (result.ok) {
      setPrefs((all) => all.map((x) => (x.purpose === p.purpose && x.channel === p.channel ? { ...x, granted: false } : x)));
      setMessage(t.stopped);
    } else {
      setMessage(result.error?.message || dict.form.unknownError);
    }
  }

  async function signOut() {
    await call({ action: "logout" });
    window.location.reload();
  }

  return (
    <>
      <section className="card">
        <h2>{t.preferences}</h2>
        <p className="muted">{t.preferencesHint}</p>
        {message && <p className="notice" role="status">{message}</p>}
        <table className="facts">
          <tbody>
            {prefs.map((p) => (
              <tr key={`${p.purpose}-${p.channel}`}>
                <th scope="row">{optionLabel(dict, p.purpose)} · {optionLabel(dict, p.channel)}</th>
                <td>{p.granted ? t.active : t.inactive}</td>
                <td>{p.granted && <button className="btn secondary" onClick={() => withdraw(p)}>{t.stop}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div><button className="btn secondary" onClick={signOut}>{t.signOut}</button></div>
    </>
  );
}
