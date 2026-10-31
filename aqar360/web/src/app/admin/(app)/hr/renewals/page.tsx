import { HrHeader } from "@/admin/hr-header";
import { Renewals } from "@/admin/hr-sections";
import { omanToday } from "@/admin/hr";
import { adminDict, adminLang } from "@/admin/i18n";
import { requireApp } from "@/lib/auth";

export default async function HrRenewalsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireApp("hr", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).hr;
  const { error } = await searchParams;
  return (
    <>
      <HrHeader t={t} tab="renewals" error={error} lang={lang} />
      <Renewals lang={lang} t={t} today={omanToday()} />
    </>
  );
}
