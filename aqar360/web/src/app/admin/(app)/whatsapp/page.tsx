import Link from "next/link";

import { ago } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { requireApp } from "@/lib/auth";
import { conversations, waReady } from "@/lib/whatsapp";

/** WhatsApp inbox: every customer conversation, newest first, with the number of unanswered messages. */
export default async function WhatsAppInbox() {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const t = adminDict(lang).wa;
  const rows = await conversations();
  return (
    <>
      <header className="a-head"><h1>💬 {t.title}</h1><p className="a-muted">{t.intro}</p></header>
      {!(await waReady()) && <p className="a-alert">{t.notConnected}</p>}
      <section className="a-panel">
        {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <ul className="a-list">
            {rows.map(({ contact, last, unread }) => (
              <li key={contact.id} className={unread ? "a-unread" : ""}>
                <Link href={`/admin/whatsapp/${contact.id}`}><strong>{contact.name}</strong> <span className="a-muted" dir="ltr">{contact.phone}</span>
                  {unread > 0 && <span className="a-badge-inline">{unread}</span>}</Link>
                <span className="a-muted" dir="auto">{last.direction === "out" ? "➡ " : "⬅ "}{last.body.slice(0, 120)} · {ago(last.createdAt, lang)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
