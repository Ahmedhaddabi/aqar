import { HrHeader } from "@/admin/hr-header";
import { People } from "@/admin/hr-sections";
import { listEmployees } from "@/admin/hr";
import { adminDict, adminLang } from "@/admin/i18n";
import { requireApp } from "@/lib/auth";

export default async function HrPeoplePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireApp("hr", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).hr;
  const [{ error }, people] = await Promise.all([searchParams, listEmployees()]);
  return (
    <>
      <HrHeader t={t} tab="people" error={error} lang={lang} />
      <People people={people} lang={lang} t={t} />
    </>
  );
}
