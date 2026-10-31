"use client";

import Link from "next/link";
import { useEffect } from "react";

import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";
import type { FormConfig } from "@/lib/content";
import { turnstileSiteKey } from "@/lib/config";

import { Check, TextInput } from "./fields";

type Errors = Record<string, string> | undefined;

export const CONTACT_SPEC = {
  full_name: "text", phone: "text", email: "text", language: "text", privacy_terms_version: "text",
  marketing_consent: "bool", marketing_terms_version: "text",
} as const;

export function ContactAndConsent({ lang, dict, config, errors, children }: {
  lang: Locale; dict: Dictionary; config: FormConfig; errors: Errors; children?: React.ReactNode;
}) {
  const f = dict.form;
  const { privacy_policy: privacy, marketing_consent: marketing } = config.terms;
  return (
    <>
      <fieldset>
        <legend>{f.contactSection}</legend>
        <div className="fields">
          <TextInput name="full_name" label={f.fullName} errors={errors} required autoComplete="name" />
          <TextInput name="phone" label={f.phone} errors={errors} required type="tel" inputMode="tel" autoComplete="tel"
            hint={f.phoneHint} dir="ltr" />
          <TextInput name="email" label={f.email} errors={errors} type="email" autoComplete="email" hint={f.emailHint} dir="ltr" />
        </div>
        <input type="hidden" name="language" value={lang} />
      </fieldset>
      <fieldset>
        <legend>{f.consentSection}</legend>
        {children}
        {/* Marketing consent is separate from the request and only offered with approved wording (§12.1, F.4). */}
        {marketing && (
          <>
            <Check name="marketing_consent" errors={errors}
              label={<>{f.marketing} — <Link href={`/${lang}/legal/marketing-consent`}>{dict.legalNames["marketing-consent"]}</Link></>} />
            <input type="hidden" name="marketing_terms_version" value={marketing} />
          </>
        )}
        {privacy ? (
          <>
            <Check name="privacy_ack" required errors={errors}
              label={<>{f.privacyAccept} — <Link href={`/${lang}/legal/privacy`}>{f.privacyLink}</Link></>} />
            <input type="hidden" name="privacy_terms_version" value={privacy} />
          </>
        ) : (
          <p className="muted">{f.privacyNotice} <Link href={`/${lang}/legal/privacy`}>{f.privacyLink}</Link>.</p>
        )}
        {config.captcha_required && turnstileSiteKey && <Turnstile />}
      </fieldset>
    </>
  );
}

export function Turnstile() {
  useEffect(() => {
    if (document.getElementById("cf-turnstile-script")) return;
    const script = document.createElement("script");
    script.id = "cf-turnstile-script";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);
  return <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />;
}
