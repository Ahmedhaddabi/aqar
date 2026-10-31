import Link from "next/link";

import type { AdminDict } from "./i18n";

/** Title, intro and error line shared by the HR pages. */
export function HrHeader({ t, tab, error, lang }: { t: AdminDict["hr"]; tab: "people" | "leave" | "payroll" | "renewals"; error?: string;
  lang: "ar" | "en" }) {
  return (
    <>
      <header className="a-head a-request-head">
        <div><h1>{t.tabs[tab]}</h1><p className="a-muted">{tab === "payroll" ? t.payrollIntro : tab === "renewals" ? t.renewalsIntro : t.intro}</p></div>
        {tab === "people" && <Link className="a-btn primary" href="/admin/hr/employees/new">+ {t.addEmployee}</Link>}
      </header>
      {error && <p className="a-alert">{error === "empty" ? t.noEmployees : lang === "ar" ? "يرجى مراجعة الحقول." : "Please check the fields."}</p>}
    </>
  );
}
