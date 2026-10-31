import Link from "next/link";
import { notFound } from "next/navigation";

import { getPayslip } from "@/admin/hr";
import { adminDict, adminLang } from "@/admin/i18n";
import { companyDetails } from "@/admin/money";
import { requireApp } from "@/lib/auth";

import { PrintButton } from "../../../invoices/[id]/PrintButton";

/** Bilingual payslip, printed or saved as PDF from the browser. */
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireApp("hr", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const data = await getPayslip(Number((await params).id));
  if (!data) notFound();
  const { slip, employee: e, run } = data;
  const company = await companyDetails();
  const rows: [string, number][] = [["Basic salary / الراتب الأساسي", slip.basic], ["Allowances / البدلات", slip.allowances],
    ["Deductions / الخصومات", -slip.deductions]];
  return (
    <>
      <div className="a-noprint a-inline a-doc-actions">
        <Link href={`/admin/hr/payroll/${run.id}`}>← {T.hr.tabs.payroll}</Link>
        <PrintButton label={T.money.print} />
      </div>
      <article className="a-doc">
        <header className="a-doc-head">
          <div><h2>{company.nameEn}</h2><p>{company.address}</p></div>
          <div className="a-doc-title"><h1>PAYSLIP · قسيمة راتب</h1><p dir="ltr"><strong>{run.month}</strong></p></div>
          <div dir="rtl" className="a-doc-ar"><h2>{company.nameAr}</h2></div>
        </header>
        <section className="a-doc-bill">
          <p><strong>{e.name}</strong></p>
          <p>{e.jobTitle}</p>
          {e.idNumber && <p>ID / الرقم المدني: {e.idNumber}</p>}
        </section>
        <table className="a-doc-table">
          <tbody>{rows.map(([label, v]) => <tr key={label}><td>{label}</td><td>{v.toFixed(3)}</td></tr>)}</tbody>
          <tfoot><tr><td>Net pay (OMR) / صافي الراتب</td><td><strong>{slip.net.toFixed(3)}</strong></td></tr></tfoot>
        </table>
        {slip.notes && <p className="a-doc-note" dir="auto">{slip.notes}</p>}
        {run.paidOn && <p className="a-doc-note">Paid on / تاريخ الدفع: {run.paidOn}</p>}
      </article>
    </>
  );
}
