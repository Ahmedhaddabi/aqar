import { eq } from "drizzle-orm";
import QRCode from "qrcode";

import { ChangePasswordForm, MfaCodeForm } from "@/admin/forms";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { openSecret, otpauthUri } from "@/lib/totp";

import { startMfa } from "../../actions";

export default async function AccountPage() {
  const me = await requireUser();
  const lang = await adminLang(me.language);
  const T = adminDict(lang);
  const t = T.account;
  const [row] = await db.select({ secret: users.mfaSecret, enabled: users.mfaEnabled }).from(users).where(eq(users.id, me.id));
  const pendingSecret = !row.enabled && row.secret ? openSecret(row.secret) : null;
  const qr = pendingSecret ? await QRCode.toString(otpauthUri(pendingSecret, me.email), { type: "svg", margin: 1, width: 200 }) : null;
  return (
    <>
      <header className="a-head"><h1>{t.title}</h1><p className="a-muted" dir="ltr">{me.name} · {me.email} · {T.roles[me.role]}</p></header>
      <div className="a-two-lang">
        <section className="a-panel">
          <h2>{t.password}</h2>
          <ChangePasswordForm t={t} errors={T.errors} />
        </section>
        <section className="a-panel">
          <h2>{t.mfa} <span className={`a-state ${row.enabled ? "on" : "off"}`}>{row.enabled ? t.on : t.off}</span></h2>
          <p className="a-muted">{t.mfaIntro}</p>
          {row.enabled ? (
            <><p className="a-ok">{t.enabled}</p><p className="a-muted">{t.disableHelp}</p><MfaCodeForm t={t} mode="disable" /></>
          ) : pendingSecret && qr ? (
            <div className="a-mfa-setup">
              <p>{t.scan}</p>
              {/* The SVG is generated on our server from the key; no third-party QR service sees it. */}
              <div className="a-qr" dangerouslySetInnerHTML={{ __html: qr }} />
              <p className="a-muted">{t.manual} <code dir="ltr">{pendingSecret.match(/.{1,4}/g)?.join(" ")}</code></p>
              <MfaCodeForm t={t} mode="confirm" />
            </div>
          ) : (
            <form action={startMfa}><button className="a-btn primary">{t.start}</button></form>
          )}
        </section>
      </div>
    </>
  );
}
