import Link from "next/link";

import { SetupForm } from "@/admin/forms";
import { adminDict, adminLang } from "@/admin/i18n";
import { hasAnyUser } from "@/lib/auth";

export default async function SetupPage() {
  const t = adminDict(await adminLang());
  const done = await hasAnyUser();
  return (
    <main className="a-auth">
      <div className="a-auth-card">
        <p className="a-brand">{t.appName}</p>
        <h1>{t.setup.title}</h1>
        {done ? <p>{t.setup.closed} <Link href="/admin/login">{t.login.title}</Link></p> : (
          <>
            <p className="a-muted">{t.setup.intro}</p>
            <SetupForm t={t.setup} errors={t.errors} />
          </>
        )}
      </div>
    </main>
  );
}
