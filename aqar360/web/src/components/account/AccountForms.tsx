"use client";

import { type FormEvent, useState } from "react";

import type { Dictionary } from "@/i18n/dictionaries";

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/account", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, error: { message: "" } }));
}

/** Sign in, create an account (Frappe sends the password link) and password reset. */
export function AccountForms({ dict, notice }: { dict: Dictionary; notice?: string }) {
  const t = dict.pages.account;
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(notice ? { text: notice } : null);
  const [busy, setBusy] = useState(false);

  const submit = (action: string) => async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setMessage(null);
    const result = await post({ action, ...data });
    setBusy(false);
    if (action === "login" && result.ok) {
      window.location.reload();
      return;
    }
    setMessage(result.ok ? { text: t.sent } : { text: result.error?.message || dict.form.unknownError, error: true });
  };

  return (
    <div className="grid two" style={{ alignItems: "start" }}>
      {message && <div className={message.error ? "form-error" : "notice"} role="status" style={{ gridColumn: "1 / -1" }}>
        {message.text}</div>}
      <form className="card intake" onSubmit={submit("login")}>
        <h2>{t.signInTitle}</h2>
        <div className="field"><label htmlFor="login-email">{t.email}</label>
          <input id="login-email" name="email" type="email" autoComplete="username" required dir="ltr" /></div>
        <div className="field"><label htmlFor="login-password">{t.password}</label>
          <input id="login-password" name="password" type="password" autoComplete="current-password" required dir="ltr" /></div>
        <button className="btn primary" disabled={busy}>{busy ? t.signingIn : t.signIn}</button>
      </form>
      <div className="grid" style={{ gap: 16 }}>
        <form className="card intake" onSubmit={submit("signup")}>
          <h2>{t.createTitle}</h2>
          <p className="muted">{t.createHint}</p>
          <div className="field"><label htmlFor="signup-name">{t.fullName}</label>
            <input id="signup-name" name="full_name" type="text" autoComplete="name" required /></div>
          <div className="field"><label htmlFor="signup-email">{t.email}</label>
            <input id="signup-email" name="email" type="email" autoComplete="email" required dir="ltr" /></div>
          <button className="btn secondary" disabled={busy}>{t.create}</button>
        </form>
        <form className="card intake" onSubmit={submit("reset")}>
          <h2 style={{ fontSize: "1.1rem" }}>{t.forgotTitle}</h2>
          <div className="field"><label htmlFor="reset-email">{t.email}</label>
            <input id="reset-email" name="email" type="email" autoComplete="email" required dir="ltr" /></div>
          <button className="btn secondary" disabled={busy}>{t.reset}</button>
        </form>
      </div>
    </div>
  );
}
