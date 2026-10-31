import Link from "next/link";
import { notFound } from "next/navigation";

import { money } from "@/admin/format";
import { getRun, omanToday } from "@/admin/hr";
import { adminDict, adminLang } from "@/admin/i18n";
import { requireApp } from "@/lib/auth";

import { markRunPaid, updatePayslip } from "../../../../hr-actions";

export default async function PayrollRunPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireApp("hr", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).hr;
  const data = await getRun(Number((await params).id));
  if (!data) notFound();
  const { run, slips } = data;
  const draft = run.status === "draft";
  const total = slips.reduce((a, s) => a + s.slip.net, 0);
  return (
    <>
      <p><Link href="/admin/hr/payroll">← {t.tabs.payroll}</Link></p>
      <header className="a-head a-request-head">
        <div><h1>{t.tabs.payroll} <span dir="ltr">{run.month}</span></h1><p className="a-muted">{t.payrollIntro}</p></div>
        <span className={`a-status big ${draft ? "s-working" : "s-won"}`}>{t.runStatuses[run.status]}</span>
      </header>
      {(await searchParams).error === "exists" && <p className="a-alert">{t.alreadyExists}</p>}
      <section className="a-panel">
        <table className="a-table">
          <thead><tr><th>{t.employee}</th><th>{t.basicSalary}</th><th>{t.allowances}</th><th>{t.deductions}</th><th>{t.net}</th><th /></tr></thead>
          <tbody>
            {slips.map(({ slip, employee }) => (
              <tr key={slip.id}>
                <td data-label={t.employee}><strong>{employee.name}</strong><div className="a-muted">{employee.jobTitle}</div></td>
                <td data-label={t.basicSalary}>{slip.basic.toFixed(3)}</td>
                {draft ? (
                  <td colSpan={2}>
                    <form action={updatePayslip} className="a-inline">
                      <input type="hidden" name="id" value={slip.id} />
                      <input type="number" name="allowances" min={0} step="0.001" defaultValue={slip.allowances} aria-label={t.allowances} />
                      <input type="number" name="deductions" min={0} step="0.001" defaultValue={slip.deductions} aria-label={t.deductions} />
                      <input name="notes" defaultValue={slip.notes} placeholder={t.notes} aria-label={t.notes} dir="auto" />
                      <button className="a-btn small">{t.save}</button>
                    </form>
                  </td>
                ) : (<><td data-label={t.allowances}>{slip.allowances.toFixed(3)}</td><td data-label={t.deductions}>{slip.deductions.toFixed(3)}</td></>)}
                <td data-label={t.net}><strong>{slip.net.toFixed(3)}</strong></td>
                <td><Link className="a-btn small" href={`/admin/hr/payslips/${slip.id}`}>{t.payslip}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="a-total" style={{ marginTop: 12 }}>{t.totalNet}: {money(total, lang)}</p>
      </section>
      {draft && (
        <section className="a-panel">
          <form action={markRunPaid} className="a-inline">
            <input type="hidden" name="id" value={run.id} />
            <input type="date" name="paidOn" defaultValue={omanToday()} required aria-label={t.markPaid} />
            <button className="a-btn primary">✓ {t.markPaid}</button>
          </form>
        </section>
      )}
    </>
  );
}
