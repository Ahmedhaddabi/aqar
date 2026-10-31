import { HrHeader } from "@/admin/hr-header";
import { Leave } from "@/admin/hr-sections";
import { listEmployees, omanToday } from "@/admin/hr";
import { adminDict, adminLang } from "@/admin/i18n";
import { requireApp } from "@/lib/auth";

export default async function HrLeavePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireApp("hr", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).hr;
  const [{ error }, people] = await Promise.all([searchParams, listEmployees()]);
  return (
    <>
      <HrHeader t={t} tab="leave" error={error} lang={lang} />
      <Leave people={people} lang={lang} t={t} today={omanToday()} />
    </>
  );
}
