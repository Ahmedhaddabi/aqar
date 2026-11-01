import Link from "next/link";

import { createAgreementForm } from "@/app/admin/agreement-actions";
import { AGREEMENT_TEMPLATES, agreementsFor } from "@/lib/agreements";

import { dateOnly } from "./format";
import type { AdminDict, AdminLang } from "./i18n";

/** Agreements of a customer (or one request), with "new agreement from a template". */
export async function AgreementsPanel({ t, lang, contactId, requestId }: { t: AdminDict["agr"]; lang: AdminLang; contactId: number; requestId?: number }) {
  const rows = await agreementsFor(requestId ? { requestId } : { contactId });
  return (
    <section className="a-panel" id="agreements">
      <h2>✍️ {t.title}</h2>
      {rows.length > 0 && (
        <ul className="a-list">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={`/admin/agreements/${a.id}`}><strong dir="ltr">{a.number}</strong> · <span dir="auto">{a.title}</span></Link>
              <span className={`a-state ${a.status === "signed" ? "on" : a.status === "declined" || a.status === "cancelled" ? "bad" : "off"}`}>{t.statuses[a.status]}</span>
              <span className="a-muted">{dateOnly(a.signedAt ?? a.sentAt ?? a.createdAt, lang)}</span>
            </li>
          ))}
        </ul>
      )}
      <form action={createAgreementForm} className="a-inline">
        <input type="hidden" name="contactId" value={contactId} />
        {requestId && <input type="hidden" name="requestId" value={requestId} />}
        <select name="template" aria-label={t.template}>
          {Object.keys(AGREEMENT_TEMPLATES).map((k) => <option key={k} value={k}>{t.templates[k]}</option>)}
        </select>
        <button className="a-btn small">{t.create}</button>
      </form>
    </section>
  );
}
