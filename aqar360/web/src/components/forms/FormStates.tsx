import Link from "next/link";

import type { Dictionary } from "@/i18n/dictionaries";
import { contact, type Locale } from "@/lib/config";

import type { Result } from "./useIntakeForm";

export function FormSuccess({ lang, dict, result }: { lang: Locale; dict: Dictionary; result: Result }) {
  const f = dict.form;
  return (
    <div className="form-success" role="status">
      <h2>{f.successTitle}</h2>
      <p>{f.successText}</p>
      <p>{f.requestNumber}: <span className="request-number">{result.request_number}</span></p>
      <p><strong>{result.status}</strong></p>
      {result.self_service_token && (
        <>
          <p><Link className="btn primary" href={`/${lang}/my-request?token=${encodeURIComponent(result.self_service_token)}`}>
            {f.trackLink}</Link></p>
          <p className="muted">{f.trackHint}</p>
        </>
      )}
    </div>
  );
}

/** Shown when public forms are switched off; never a dead end (§26.9). */
export function FormsClosed({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  return (
    <div className="notice warn">
      <h2 style={{ marginTop: 0 }}>{dict.form.closedTitle}</h2>
      <p>{dict.form.closedText}</p>
      <div className="actions">
        {contact.whatsapp && <a className="btn primary" href={`https://wa.me/${contact.whatsapp}`}>{dict.pages.contact.whatsapp}</a>}
        {contact.phone && <a className="btn secondary" href={`tel:${contact.phone}`}>{contact.phone}</a>}
        <Link className="btn secondary" href={`/${lang}/contact`}>{dict.nav.contact}</Link>
      </div>
    </div>
  );
}
