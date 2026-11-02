import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { isLocale, type Locale } from "@/lib/config";
import { currentCustomer } from "@/lib/customer-auth";

import { loginAction, signupAction } from "../actions";
import { accountText } from "../text";

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<{ mode?: string; error?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return { title: accountText(isLocale(lang) ? lang : "ar").tabLogin, robots: { index: false, follow: false } };
}

/** Log in / create account on the blue band (design: glass card, two tabs, keep me logged in, continue as guest). */
export default async function LoginPage({ params, searchParams }: Props) {
  const { lang: raw } = await params;
  const lang: Locale = isLocale(raw) ? raw : "ar";
  const q = await searchParams;
  if (await currentCustomer()) redirect(`/${lang}/account`);
  const t = accountText(lang);
  const signup = q.mode === "signup";
  const error = q.error ? t.errors[q.error] ?? t.errors.wrong : null;
  return (
    <div className="acct-band">
      <section className="auth-card">
        <h1>{signup ? t.signupTitle : t.loginTitle}</h1>
        <p className="muted">{signup ? t.signupLead : t.loginLead}</p>
        <nav className="auth-tabs">
          <Link href={`/${lang}/account/login`} aria-current={signup ? undefined : "page"}>{t.tabLogin}</Link>
          <Link href={`/${lang}/account/login?mode=signup`} aria-current={signup ? "page" : undefined}>{t.tabSignup}</Link>
        </nav>
        {error && <p className="auth-msg err" role="alert">{error}</p>}
        <form action={signup ? signupAction : loginAction} className="auth-form">
          <input type="hidden" name="lang" value={lang} />
          {signup && (
            <label className="f">{t.name}<input type="text" name="name" required minLength={2} maxLength={120} autoComplete="name" /></label>
          )}
          <label className="f">{t.identifier}
            <input type="text" name="identifier" required dir="ltr" autoComplete="username" inputMode="email" placeholder={t.identifierHint} />
          </label>
          <label className="f">{signup ? t.newPassword : t.password}
            <input type="password" name="password" required minLength={signup ? 8 : 1} autoComplete={signup ? "new-password" : "current-password"} />
          </label>
          <div className="row">
            <label className="check"><input type="checkbox" name="keep" defaultChecked /> {t.keep}</label>
            {!signup && <Link href={`/${lang}/account/forgot`}>{t.forgot}</Link>}
          </div>
          <button className="btn primary">{signup ? t.signup : t.login}</button>
          {signup && <p className="muted small">{t.terms} <Link href={`/${lang}/legal/privacy`}>{t.privacy}</Link>.</p>}
        </form>
        <div className="auth-or">{t.or}</div>
        <Link className="btn secondary" style={{ width: "100%" }} href={`/${lang}/find-me-a-property`}>{t.guest}</Link>
        <p className="muted small" style={{ marginTop: 12 }}>{t.guestHint}</p>
      </section>
    </div>
  );
}
