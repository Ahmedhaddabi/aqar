import Link from "next/link";
import { redirect } from "next/navigation";

import { adminDict, adminLang } from "@/admin/i18n";
import { audit, requireApp } from "@/lib/auth";
import { reportText, sendWeeklyReport, weeklyReport } from "@/lib/weekly";

async function sendNow() {
  "use server";
  const user = await requireApp("crm", ["admin"]);
  const sent = await sendWeeklyReport(new Date(), { force: true });
  await audit("weekly_report_sent", "report", null, { sent }, user.id);
  redirect(`/admin/reports/weekly?sent=${sent}`);
}

/** The weekly manager report as it is emailed every Sunday; admins can send it now. */
export default async function WeeklyReportPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).weekly;
  const [report, q] = await Promise.all([weeklyReport(), searchParams]);
  const { subject, body } = reportText(report, lang);
  return (
    <>
      <p><Link href="/admin/reports">← {adminDict(lang).reports.title}</Link></p>
      <header className="a-head"><h1>📨 {t.title}</h1><p className="a-muted">{t.intro}</p></header>
      {q.sent !== undefined && <p className={Number(q.sent) > 0 ? "a-ok" : "a-warn"}>{Number(q.sent) > 0 ? t.sent.replace("{n}", q.sent) : t.notSent}</p>}
      <section className="a-panel">
        <h2 dir="auto">{subject}</h2>
        <pre className="a-report" dir="auto">{body}</pre>
        {user.role === "admin" && <form action={sendNow}><button className="a-btn primary">{t.sendNow}</button></form>}
      </section>
    </>
  );
}
