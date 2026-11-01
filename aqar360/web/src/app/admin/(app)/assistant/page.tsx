import { AssistantChat } from "@/admin/AiParts";
import { adminDict, adminLang } from "@/admin/i18n";
import { aiReady } from "@/lib/ai";
import { requireApp } from "@/lib/auth";

/** The staff assistant (strategy §26.8): plain-language questions about our own data; read-only; per-person permissions. */
export default async function AssistantPage() {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const t = adminDict(lang).ai;
  return (
    <>
      <header className="a-head"><h1>✨ {t.title}</h1><p className="a-muted">{t.intro}</p></header>
      {!(await aiReady()) ? <p className="a-alert">{t.off}</p> : (
        <section className="a-panel"><AssistantChat t={t} examples={t.examples.split("|")} /></section>
      )}
      <p className="a-muted">{t.privacy}</p>
    </>
  );
}
