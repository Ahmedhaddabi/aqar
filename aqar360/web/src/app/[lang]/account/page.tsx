import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CustomerDashboard } from "@/app/portal/Dashboard";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { isLocale, type Locale } from "@/lib/config";
import { currentCustomer } from "@/lib/customer-auth";
import { portalParams } from "@/lib/doc-link";

import { logoutAction, sendVerifyAction, verifyAction } from "./actions";
import { accountText } from "./text";

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<{ done?: string; error?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return { title: accountText(isLocale(lang) ? lang : "ar").details, robots: { index: false, follow: false } };
}

/** "My account": the signed-in customer's requests, viewings, saved properties, invoices and files (once linked to their record). */
export default async function AccountPage({ params, searchParams }: Props) {
  const { lang: raw } = await params;
  const lang: Locale = isLocale(raw) ? raw : "ar";
  const q = await searchParams;
  const account = await currentCustomer();
  if (!account) redirect(`/${lang}/account/login`);
  const t = accountText(lang);
  const [contact] = account.contactId ? await db.select().from(contacts).where(eq(contacts.id, account.contactId)) : [];
  const notice = q.done && q.done in t.done ? t.done[q.done] : null;
  return (
    <section className="container acct">
      <header className="acct-head">
        <div>
          <p className="eyebrow">{t.details}</p>
          <h1>{t.hello} {account.name}</h1>
        </div>
        <div className="navtools">
          <Link className="btn primary" href={`/${lang}/find-me-a-property`}>{t.startRequest}</Link>
          <form action={logoutAction}><input type="hidden" name="lang" value={lang} /><button className="btn secondary">{t.logout}</button></form>
        </div>
      </header>
      {notice && <p className="auth-msg ok" role="status">{notice}</p>}

      <div className="acct-grid" style={{ marginBottom: 24 }}>
        <article className="card">
          <h2>{t.details}</h2>
          <p>{account.name}</p>
          {account.phone && <p dir="ltr" style={{ textAlign: "start" }}>{account.phone}</p>}
          {account.email && (
            <p><span dir="ltr">{account.email}</span> · <span className="muted small">{account.emailVerifiedAt ? t.verifiedEmail : t.notVerified}</span></p>
          )}
        </article>
        {!contact && (
          <article className="card" id="connect">
            <h2>{t.linkTitle}</h2>
            {q.error === "code" && <p className="auth-msg err" role="alert">{t.errors.code}</p>}
            {account.email && (
              <>
                <p className="muted">{t.linkEmail}</p>
                <form action={verifyAction} className="auth-form" style={{ marginTop: 12 }}>
                  <input type="hidden" name="lang" value={lang} />
                  <label className="f">{t.linkEnter}
                    <input type="text" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} dir="ltr" />
                  </label>
                  <button className="btn primary">{t.confirm}</button>
                </form>
                <form action={sendVerifyAction} style={{ marginTop: 8 }}>
                  <input type="hidden" name="lang" value={lang} /><button className="btn secondary">{t.resend}</button>
                </form>
              </>
            )}
            <p className="muted small" style={{ marginTop: 12 }}>{t.linkOther}</p>
          </article>
        )}
      </div>

      {contact ? (
        <div className="cust"><CustomerDashboard contact={contact} p={portalParams(contact.id)} done={q.done} /></div>
      ) : (
        <p className="muted">{t.noRequests}</p>
      )}
    </section>
  );
}
