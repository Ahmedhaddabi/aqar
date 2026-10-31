import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { revalidatePath } from "next/cache";

import { ago } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { markRead } from "@/lib/notify";

async function markAll() {
  "use server";
  const me = await requireUser();
  await markRead(me.id);
  revalidatePath("/admin", "layout");
}

export default async function NotificationsPage() {
  const me = await requireUser();
  const lang = await adminLang(me.language);
  const t = adminDict(lang).notif;
  const rows = await db.select().from(notifications).where(eq(notifications.userId, me.id)).orderBy(desc(notifications.createdAt)).limit(200);
  return (
    <>
      <header className="a-head a-request-head">
        <h1>{t.title}</h1>
        {rows.some((r) => !r.readAt) && <form action={markAll}><button className="a-btn">{t.markAll}</button></form>}
      </header>
      <section className="a-panel">
        {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
          <ul className="a-list">
            {rows.map((n) => (
              <li key={n.id} className={n.readAt ? "" : "a-unread"}>
                <Link href={`/admin/notifications/${n.id}`}><strong>{t.kinds[n.kind] ?? n.kind}</strong> · <span dir="auto">{n.title}</span></Link>
                <span className="a-muted">{ago(n.createdAt, lang)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
