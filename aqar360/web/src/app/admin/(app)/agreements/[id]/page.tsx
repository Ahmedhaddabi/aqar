import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { dateTime } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { agreements, contacts, requests } from "@/db/schema";
import { textHash } from "@/lib/agreements";
import { requireApp } from "@/lib/auth";
import { agreementLink } from "@/lib/doc-link";

import { cancelAgreement, resendAgreement, saveAgreementDraft } from "../../../agreement-actions";

/** One agreement: edit while draft, send, then follow it until signed (signature, name, time, text check). */
export default async function AgreementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; sent?: string; error?: string }> }) {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const t = adminDict(lang).agr;
  const id = Number((await params).id);
  const [row] = Number.isInteger(id) ? await db.select({ a: agreements, c: contacts, r: requests }).from(agreements)
    .innerJoin(contacts, eq(agreements.contactId, contacts.id)).leftJoin(requests, eq(agreements.requestId, requests.id)).where(eq(agreements.id, id)) : [];
  if (!row) notFound();
  const { a, c, r } = row;
  const q = await searchParams;
  const intact = !a.bodyHash || a.bodyHash === textHash(a.title, a.body);
  return (
    <>
      <p><Link href="/admin/agreements">← {t.title}</Link></p>
      <header className="a-head">
        <h1><span dir="ltr">{a.number}</span> · <span dir="auto">{a.title}</span></h1>
        <p className="a-muted"><Link href={`/admin/customers/${c.id}`}>{c.name}</Link>{r && <> · <Link href={`/admin/requests/${r.id}`}>{r.number}</Link></>}
          {" · "}<span className={`a-state ${a.status === "signed" ? "on" : a.status === "declined" || a.status === "cancelled" ? "bad" : "off"}`}>{t.statuses[a.status]}</span></p>
      </header>
      {q.saved && <p className="a-ok">{t.saved}</p>}
      {q.sent && <p className="a-ok">{t.sentNote}</p>}
      {q.error && <p className="a-alert">{t.invalid}</p>}
      {a.status === "draft" ? (
        <form action={saveAgreementDraft} className="a-panel a-form">
          <input type="hidden" name="id" value={a.id} />
          <p className="a-muted">{t.draftHelp}</p>
          <label className="a-field"><span>{t.titleLabel}</span><input name="title" defaultValue={a.title} required maxLength={200} dir="auto" /></label>
          <label className="a-field"><span>{t.body}</span><textarea name="body" defaultValue={a.body} rows={22} required dir="auto" /></label>
          <div className="a-inline">
            <button className="a-btn">{t.save}</button>
            <button className="a-btn primary" name="send" value="1">{t.send}</button>
          </div>
        </form>
      ) : (
        <section className="a-panel">
          <div className="agreement-body">{a.body.split(/\n{2,}/).map((para, i) => <p key={i} dir="auto">{para}</p>)}</div>
          {a.status !== "cancelled" && <><p className="a-muted">{t.customerLink}</p><code className="a-code" dir="ltr">{agreementLink(a.id)}</code></>}
          {a.sentAt && <p className="a-muted">{t.sentAt}: {dateTime(a.sentAt, lang)}</p>}
          {a.status === "signed" && (
            <div className="agreement-signed">
              {a.signature && <img src={a.signature} alt="" className="sig-image" />}
              <p><strong dir="auto">{a.signerName}</strong> · {a.signedAt ? dateTime(a.signedAt, lang) : ""}</p>
              <p className={intact ? "a-ok-text" : "a-alert"}>{intact ? `✓ ${t.intact}` : t.changed}</p>
              <p className="a-muted agreement-hash" dir="ltr">SHA-256 {a.bodyHash}</p>
              <p className="a-muted" dir="ltr">{a.signerAgent}</p>
            </div>
          )}
          {a.status === "declined" && <p className="a-alert">{t.statuses.declined}{a.declineReason ? `: ${a.declineReason}` : ""}</p>}
          <div className="a-inline">
            {a.status === "sent" && <form action={resendAgreement}><input type="hidden" name="id" value={a.id} /><button className="a-btn small">{t.resend}</button></form>}
            {["sent"].includes(a.status) && (
              <form action={cancelAgreement}><input type="hidden" name="id" value={a.id} /><button className="a-btn small danger">{t.cancel}</button></form>
            )}
            {a.status !== "cancelled" && <a className="a-btn small" href={agreementLink(a.id)} target="_blank" rel="noreferrer">{t.open} ↗</a>}
          </div>
        </section>
      )}
    </>
  );
}
