import { asc, eq } from "drizzle-orm";

import { AddUserForm, ResetPasswordForm } from "@/admin/forms";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { APPS, areas, ROLES, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";

import { changeRole, resetMfa, setApps, setReceivesRequests, toggleUser } from "../../actions";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireUser(["admin"]);
  const lang = await adminLang(me.language);
  const t = adminDict(lang);
  const { error } = await searchParams;
  const [rows, areaRows] = await Promise.all([db.select().from(users).orderBy(asc(users.name)),
    db.select({ id: areas.id, en: areas.nameEn, ar: areas.nameAr }).from(areas).where(eq(areas.active, true)).orderBy(asc(areas.nameEn))]);
  const appNames = { crm: t.nav.crm, erp: t.nav.erp, hr: t.nav.hrApp };
  const when = new Intl.DateTimeFormat(lang === "ar" ? "ar-OM-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  return (
    <>
      <header className="a-head">
        <h1>{t.users.title}</h1>
        <p className="a-muted">{t.users.intro}</p>
      </header>
      {error === "cannotDisableSelf" && <p className="a-alert">{t.users.cannotDisableSelf}</p>}

      <section className="a-panel">
        <h2>{t.users.add}</h2>
        <AddUserForm t={t.users} roles={t.roles} roleHelp={t.roleHelp} errors={t.errors} apps={appNames} />
      </section>

      <section className="a-panel">
        <table className="a-table">
          <thead>
            <tr><th>{t.users.name}</th><th>{t.users.role}</th><th>{t.users.apps}</th><th>{t.users.status}</th><th>{t.users.lastLogin}</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className={u.active ? "" : "muted"}>
                <td data-label={t.users.name}>
                  <strong>{u.name}</strong>{u.id === me.id && <span className="a-tag">{t.users.you}</span>}
                  <div className="a-muted" dir="ltr">{u.email}</div>
                </td>
                <td data-label={t.users.role}>
                  {u.id === me.id ? t.roles[u.role] : (
                    <form action={changeRole} className="a-inline">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role" defaultValue={u.role} aria-label={t.users.role}>
                        {ROLES.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
                      </select>
                      <button className="a-btn small">✓</button>
                    </form>
                  )}
                </td>
                <td data-label={t.users.apps}>
                  {u.role === "admin" ? <span className="a-muted">{APPS.map((a) => appNames[a]).join(" · ")}</span> : (
                    <form action={setApps} className="a-inline">
                      <input type="hidden" name="id" value={u.id} />
                      {APPS.map((a) => <label key={a} className="a-check"><input type="checkbox" name="apps" value={a} defaultChecked={u.apps.includes(a)} /> {appNames[a]}</label>)}
                      <button className="a-btn small">{t.users.saveApps}</button>
                    </form>
                  )}
                  {u.active && (
                    <form action={setReceivesRequests} className="a-inline">
                      <input type="hidden" name="id" value={u.id} />
                      <label className="a-check" title={t.users.receivesHelp}><input type="checkbox" name="receives" defaultChecked={u.receivesRequests} /> {t.users.receives}</label>
                      {areaRows.length > 0 && (
                        <details className="a-areas-pick"><summary>{t.users.areas}{u.areaIds.length ? ` (${u.areaIds.length})` : ""}</summary>
                          {areaRows.map((a) => <label key={a.id} className="a-check"><input type="checkbox" name="areas" value={a.id} defaultChecked={u.areaIds.includes(a.id)} /> {lang === "ar" ? a.ar : a.en}</label>)}
                        </details>
                      )}
                      <button className="a-btn small">{t.users.saveRotation}</button>
                    </form>
                  )}
                </td>
                <td data-label={t.users.status}>
                  <span className={`a-state ${u.active ? "on" : "off"}`}>{u.active ? t.users.active : t.users.inactive}</span>
                  {u.mfaEnabled && <div className="a-muted">🔐 {t.users.mfa}</div>}
                </td>
                <td data-label={t.users.lastLogin}>{u.lastLoginAt ? when.format(u.lastLoginAt) : t.users.never}</td>
                <td className="a-actions">
                  {u.id !== me.id && (
                    <form action={toggleUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="a-btn small">{u.active ? t.users.disable : t.users.enable}</button>
                    </form>
                  )}
                  <ResetPasswordForm id={u.id} t={t.users} errors={t.errors} />
                  {u.mfaEnabled && u.id !== me.id && (
                    <form action={resetMfa}><input type="hidden" name="id" value={u.id} /><button className="a-btn small danger">{t.users.resetMfa}</button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
