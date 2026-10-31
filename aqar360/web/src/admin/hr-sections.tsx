// HR sections, each shown as its own page in the HR app (People, Leave, Payroll, Renewals).
import Link from "next/link";

import { dateOnly, money } from "@/admin/format";
import { annualLeaveUsed, daysUntil, type listEmployees, listLeaves, listRenewals, listRuns } from "@/admin/hr";
import { adminDict } from "@/admin/i18n";
import { LEAVE_TYPES } from "@/db/schema";

import { addLeave, addRenewal, decideLeave, prepareRun, updateRenewal } from "@/app/admin/hr-actions";

/** Red when passed, amber within 30 days. */
export function Expiry({ date, lang, t }: { date: string | null; lang: "ar" | "en"; t: { expired: string; expiring: string } }) {
  const left = daysUntil(date);
  if (left === null) return <span className="a-muted">—</span>;
  const tone = left < 0 ? "a-error" : left <= 30 ? "a-warn" : "";
  return <span className={tone}>{dateOnly(date, lang)}{left < 0 ? ` · ${t.expired}` : left <= 30 ? ` · ${t.expiring}` : ""}</span>;
}

export type T = ReturnType<typeof adminDict>["hr"];
export type People = Awaited<ReturnType<typeof listEmployees>>;

export async function People({ people, lang, t }: { people: People; lang: "ar" | "en"; t: T }) {
  const used = await annualLeaveUsed();
  if (!people.length) return <section className="a-panel"><p className="a-muted">{t.none}</p></section>;
  return (
    <section className="a-panel">
      <table className="a-table">
        <thead><tr><th>{t.name}</th><th>{t.docNames.id}</th><th>{t.docNames.passport}</th><th>{t.docNames.visa}</th><th>{t.salary}</th><th>{t.leaveLeft}</th></tr></thead>
        <tbody>
          {people.map((e) => (
            <tr key={e.id} className={e.active ? "" : "muted"}>
              <td data-label={t.name}><Link className="a-row-link" href={`/admin/hr/employees/${e.id}`}><strong>{e.name}</strong></Link>
                <div className="a-muted">{e.jobTitle}</div></td>
              <td data-label={t.docNames.id}><Expiry date={e.idExpiry} lang={lang} t={t} /></td>
              <td data-label={t.docNames.passport}><Expiry date={e.passportExpiry} lang={lang} t={t} /></td>
              <td data-label={t.docNames.visa}><Expiry date={e.visaExpiry} lang={lang} t={t} /></td>
              <td data-label={t.salary}>{money(e.basicSalary + e.allowances, lang)}</td>
              <td data-label={t.leaveLeft}>{e.annualLeaveDays - (used.get(e.id) ?? 0)} {t.days}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export async function Leave({ people, lang, t, today }: { people: People; lang: "ar" | "en"; t: T; today: string }) {
  const rows = await listLeaves();
  const active = people.filter((e) => e.active);
  return (
    <>
      <section className="a-panel">
        <h2>{t.addLeave}</h2>
        {active.length === 0 ? <p className="a-muted">{t.noEmployees}</p> : (
          <form action={addLeave} className="a-form a-grid">
            <label className="a-field"><span>{t.employee}</span>
              <select name="employeeId" required>{active.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
            <label className="a-field"><span>{t.leaveType}</span>
              <select name="type">{LEAVE_TYPES.map((k) => <option key={k} value={k}>{t.leaveTypes[k]}</option>)}</select></label>
            <label className="a-field"><span>{t.from_}</span><input type="date" name="fromDate" defaultValue={today} required /></label>
            <label className="a-field"><span>{t.to}</span><input type="date" name="toDate" defaultValue={today} required /></label>
            <label className="a-field"><span>{t.notes}</span><input name="notes" dir="auto" /></label>
            <div><button className="a-btn primary">+ {t.addLeave}</button></div>
          </form>
        )}
      </section>
      <section className="a-panel">
        {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <table className="a-table">
            <thead><tr><th>{t.employee}</th><th>{t.leaveType}</th><th>{t.from_}</th><th>{t.to}</th><th>{t.days}</th><th /></tr></thead>
            <tbody>
              {rows.map(({ leave: l, name }) => (
                <tr key={l.id}>
                  <td data-label={t.employee}><strong>{name}</strong>{l.notes && <div className="a-muted">{l.notes}</div>}</td>
                  <td data-label={t.leaveType}>{t.leaveTypes[l.type]}</td>
                  <td data-label={t.from_}>{dateOnly(l.fromDate, lang)}</td>
                  <td data-label={t.to}>{dateOnly(l.toDate, lang)}</td>
                  <td data-label={t.days}>{l.days}</td>
                  <td>{l.status === "pending" ? (
                    <div className="a-actions">
                      <form action={decideLeave}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value="approved" />
                        <button className="a-btn small primary">{t.approve}</button></form>
                      <form action={decideLeave}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value="rejected" />
                        <button className="a-btn small danger">{t.reject}</button></form>
                    </div>
                  ) : <span className={`a-status ${l.status === "approved" ? "s-won" : "s-closed"}`}>{t.leaveStatuses[l.status]}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

export async function Payroll({ lang, t, today }: { lang: "ar" | "en"; t: T; today: string }) {
  const runs = await listRuns();
  return (
    <>
      <section className="a-panel">
        <p className="a-muted">{t.payrollIntro}</p>
        <form action={prepareRun} className="a-inline" style={{ marginTop: 12 }}>
          <input type="month" name="month" defaultValue={today.slice(0, 7)} required aria-label={t.month} />
          <button className="a-btn primary">{t.prepare}</button>
        </form>
      </section>
      <section className="a-panel">
        {runs.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <table className="a-table">
            <thead><tr><th>{t.month}</th><th>{t.employees}</th><th>{t.totalNet}</th><th /></tr></thead>
            <tbody>
              {runs.map(({ run, people, total }) => (
                <tr key={run.id}>
                  <td data-label={t.month}><Link className="a-row-link" href={`/admin/hr/payroll/${run.id}`}><strong dir="ltr">{run.month}</strong></Link></td>
                  <td data-label={t.employees}>{people}</td>
                  <td data-label={t.totalNet}>{money(total, lang)}</td>
                  <td><span className={`a-status ${run.status === "paid" ? "s-won" : "s-working"}`}>{t.runStatuses[run.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

export async function Renewals({ lang, t, today }: { lang: "ar" | "en"; t: T; today: string }) {
  const rows = (await listRenewals()).filter((r) => !r.done);
  return (
    <>
      <section className="a-panel">
        <p className="a-muted">{t.renewalsIntro}</p>
        <form action={addRenewal} className="a-form a-grid">
          <label className="a-field"><span>{t.renewalTitle}</span><input name="title" required dir="auto" /></label>
          <label className="a-field"><span>{t.category}</span>
            <select name="category">{Object.entries(t.renewalCats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="a-field"><span>{t.expiresOn}</span><input type="date" name="expiresOn" required /></label>
          <label className="a-field"><span>{t.notes}</span><input name="notes" dir="auto" /></label>
          <div><button className="a-btn primary">+ {t.addRenewal}</button></div>
        </form>
      </section>
      <section className="a-panel">
        {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <table className="a-table">
            <thead><tr><th>{t.renewalTitle}</th><th>{t.expiresOn}</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-label={t.renewalTitle}><strong>{r.title}</strong><div className="a-muted">{t.renewalCats[r.category] ?? r.category}{r.notes ? ` · ${r.notes}` : ""}</div></td>
                  <td data-label={t.expiresOn}><Expiry date={r.expiresOn} lang={lang} t={t} /></td>
                  <td>
                    <div className="a-actions">
                      <form action={updateRenewal} className="a-inline"><input type="hidden" name="id" value={r.id} />
                        <input type="date" name="expiresOn" min={today} required aria-label={t.expiresOn} />
                        <button className="a-btn small primary">{t.markDone}</button></form>
                      <form action={updateRenewal}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="remove" value="1" />
                        <button className="a-btn small danger" aria-label={adminDict(lang).site.remove}>×</button></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
