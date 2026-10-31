import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/admin/forms";
import { adminDict, adminLang } from "@/admin/i18n";
import { currentUser, hasAnyUser } from "@/lib/auth";

import { setLanguage } from "../actions";

export default async function LoginPage() {
  if (await currentUser()) redirect("/admin");
  const lang = await adminLang();
  const t = adminDict(lang);
  const firstRun = !(await hasAnyUser());
  return (
    <main className="a-auth">
      <div className="a-auth-card">
        <form action={setLanguage} className="a-auth-lang">
          <input type="hidden" name="lang" value={lang === "ar" ? "en" : "ar"} />
          <input type="hidden" name="path" value="/admin/login" />
          <button className="a-link">{t.nav.language}</button>
        </form>
        <p className="a-brand">{t.appName}</p>
        <h1>{t.login.title}</h1>
        {firstRun ? <p><Link href="/admin/setup">{t.setup.title}</Link></p> : <LoginForm t={t.login} errors={t.errors} />}
      </div>
    </main>
  );
}
