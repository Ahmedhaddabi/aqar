import type { Metadata } from "next";
import Link from "next/link";

import { isLocale, type Locale } from "@/lib/config";

import { forgotAction, resetAction } from "../actions";
import { accountText } from "../text";

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<{ step?: string; error?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return { title: accountText(isLocale(lang) ? lang : "ar").forgotTitle, robots: { index: false, follow: false } };
}

/** Forgot password: email → 6-digit code → new password. The same answer whether or not the account exists. */
export default async function ForgotPage({ params, searchParams }: Props) {
  const { lang: raw } = await params;
  const lang: Locale = isLocale(raw) ? raw : "ar";
  const q = await searchParams;
  const t = accountText(lang);
  const codeStep = q.step === "code";
  return (
    <div className="acct-band">
      <section className="auth-card">
        <h1>{t.forgotTitle}</h1>
        <p className="muted">{codeStep ? t.codeSent : t.forgotLead}</p>
        {q.error && <p className="auth-msg err" role="alert">{t.errors[q.error] ?? t.errors.code}</p>}
        {codeStep ? (
          <form action={resetAction} className="auth-form">
            <input type="hidden" name="lang" value={lang} />
            <label className="f">{t.code}
              <input type="text" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} dir="ltr" />
            </label>
            <label className="f">{t.newPassword}<input type="password" name="password" required minLength={8} autoComplete="new-password" /></label>
            <label className="check"><input type="checkbox" name="keep" defaultChecked /> {t.keep}</label>
            <button className="btn primary">{t.setPassword}</button>
            <Link href={`/${lang}/account/forgot`}>{t.resend}</Link>
          </form>
        ) : (
          <form action={forgotAction} className="auth-form">
            <input type="hidden" name="lang" value={lang} />
            <label className="f">{t.identifier}<input type="email" name="identifier" required dir="ltr" autoComplete="email" /></label>
            <button className="btn primary">{t.sendCode}</button>
          </form>
        )}
        <p className="muted small" style={{ marginTop: 16 }}>{t.forgotPhone} <Link href={`/${lang}/contact`}>{t.contactUs}</Link></p>
        <p style={{ marginTop: 8 }}><Link href={`/${lang}/account/login`}>{t.backToLogin}</Link></p>
      </section>
    </div>
  );
}
