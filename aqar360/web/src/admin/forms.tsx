"use client";

import { useActionState } from "react";

import type { FormState } from "@/app/admin/actions";
import { changeOwnPassword, confirmMfa, createUser, disableMfa, login, loginCode, resetPassword, setupAdmin } from "@/app/admin/actions";

import type { AdminDict } from "./i18n";

type Errors = AdminDict["errors"] & Record<string, string>;

function Field({ name, label, type = "text", help, error, autoComplete, defaultValue, inputMode, children }: {
  name: string; label: string; type?: string; help?: string; error?: string; autoComplete?: string; defaultValue?: string;
  inputMode?: "numeric"; children?: React.ReactNode;
}) {
  return (
    <label className={`a-field${error ? " invalid" : ""}`}>
      <span>{label}</span>
      {children ?? <input name={name} type={type} autoComplete={autoComplete} defaultValue={defaultValue} required inputMode={inputMode}
        aria-invalid={!!error} dir={type === "email" || type === "password" || inputMode ? "ltr" : undefined} />}
      {help && !error && <small>{help}</small>}
      {error && <small className="a-error">{error}</small>}
    </label>
  );
}

const message = (errors: Errors, key?: string) => (key ? errors[key] ?? key : undefined);

export function LoginForm({ t, errors }: { t: AdminDict["login"]; errors: Errors }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  const [codeState, codeAction, codePending] = useActionState<FormState, FormData>(loginCode, {});
  if (state.step === "code" || codeState.step === "code") {
    const error = codeState.error;
    return (
      <form action={codeAction} className="a-form">
        <h2>{t.codeTitle}</h2>
        {error && <p className="a-alert" role="alert">{t[error as keyof typeof t] ?? message(errors, error)}</p>}
        <Field name="code" label={t.code} inputMode="numeric" autoComplete="one-time-code" />
        <button className="a-btn primary" disabled={codePending}>{t.verify}</button>
      </form>
    );
  }
  return (
    <form action={action} className="a-form">
      {(state.error || codeState.error) && <p className="a-alert" role="alert">{t[(state.error ?? codeState.error) as keyof typeof t]
        ?? message(errors, state.error)}</p>}
      <Field name="email" type="email" label={t.email} autoComplete="username" />
      <Field name="password" type="password" label={t.password} autoComplete="current-password" />
      <button className="a-btn primary" disabled={pending}>{t.submit}</button>
    </form>
  );
}

export function SetupForm({ t, errors }: { t: AdminDict["setup"]; errors: Errors }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setupAdmin, {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="a-form">
      {state.error && <p className="a-alert" role="alert">{t[state.error as keyof typeof t]}</p>}
      <Field name="token" type="password" label={t.token} help={t.tokenHelp} autoComplete="off" />
      <Field name="name" label={t.name} error={message(errors, f.name)} autoComplete="name" />
      <Field name="email" type="email" label={t.email} error={message(errors, f.email)} autoComplete="username" />
      <Field name="password" type="password" label={t.password} help={t.passwordHelp} error={message(errors, f.password)}
        autoComplete="new-password" />
      <button className="a-btn primary" disabled={pending}>{t.submit}</button>
    </form>
  );
}

export function AddUserForm({ t, roles, roleHelp, errors, apps }: {
  t: AdminDict["users"]; roles: Record<string, string>; roleHelp: Record<string, string>; errors: Errors; apps: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createUser, {});
  const f = state.fields ?? {};
  const err = (key?: string) => (key === "emailTaken" ? t.emailTaken : message(errors, key));
  return (
    <form action={action} className="a-form a-grid" key={state.ok ? Date.now() : "form"}>
      {state.ok && <p className="a-ok" role="status">{t.saved}</p>}
      <Field name="name" label={t.name} error={err(f.name)} />
      <Field name="email" type="email" label={t.email} error={err(f.email)} autoComplete="off" />
      <Field name="role" label={t.role}>
        <select name="role" defaultValue="agent">
          {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label} — {roleHelp[value]}</option>)}
        </select>
      </Field>
      <Field name="password" type="password" label={t.password} help={t.passwordHelp} error={err(f.password)}
        autoComplete="new-password" />
      <fieldset className="a-field a-apps-pick"><span>{t.apps}</span>
        {Object.entries(apps).map(([key, label]) => (
          <label key={key} className="a-check"><input type="checkbox" name="apps" value={key} defaultChecked={key === "crm"} /> {label}</label>
        ))}
      </fieldset>
      <div><button className="a-btn primary" disabled={pending}>{t.save}</button></div>
    </form>
  );
}

export function ResetPasswordForm({ id, t, errors }: { id: number; t: AdminDict["users"]; errors: Errors }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <form action={action} className="a-inline">
      <input type="hidden" name="id" value={id} />
      <input name="newPassword" type="password" placeholder={t.newPassword} aria-label={t.newPassword} autoComplete="new-password"
        dir="ltr" required />
      <button className="a-btn" disabled={pending}>{t.resetPassword}</button>
      {state.ok && <span className="a-ok-text">{t.saved}</span>}
      {state.fields?.newPassword && <span className="a-error">{errors.shortPassword}</span>}
    </form>
  );
}

export function ChangePasswordForm({ t, errors }: { t: AdminDict["account"]; errors: Errors }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeOwnPassword, {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="a-form" key={state.ok ? Date.now() : "pw"}>
      {state.ok && <p className="a-ok" role="status">{t.saved}</p>}
      <Field name="current" type="password" label={t.current} autoComplete="current-password"
        error={f.current === "wrongPassword" ? t.wrongPassword : message(errors, f.current)} />
      <Field name="newPassword" type="password" label={t.newPassword} autoComplete="new-password" error={message(errors, f.newPassword)} />
      <div><button className="a-btn primary" disabled={pending}>{t.save}</button></div>
    </form>
  );
}

/** Confirms the first code after scanning (switch on) or a current code (switch off). */
export function MfaCodeForm({ t, mode }: { t: AdminDict["account"]; mode: "confirm" | "disable" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "confirm" ? confirmMfa : disableMfa, {});
  return (
    <form action={action} className="a-inline">
      {state.error && <p className="a-alert" role="alert">{t.badCode}</p>}
      <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required aria-label={t.mfa} dir="ltr" placeholder="123456" />
      <button className={`a-btn${mode === "confirm" ? " primary" : " danger"}`} disabled={pending}>{mode === "confirm" ? t.confirm : t.disable}</button>
    </form>
  );
}
