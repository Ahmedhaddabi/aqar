import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { dateTime, whatsappLink } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { contacts, waMessages } from "@/db/schema";
import { requireApp } from "@/lib/auth";
import { waReady, windowOpen } from "@/lib/whatsapp";

import { replyWhatsApp } from "../../../wa-actions";

const TICKS: Record<string, string> = { sent: "✓", delivered: "✓✓", read: "✓✓ 👁", failed: "⚠" };

/** One WhatsApp conversation, linked to the customer's file; replies within the 24-hour window. */
export default async function WhatsAppConversation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ closed?: string }> }) {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const t = adminDict(lang).wa;
  const id = Number((await params).id);
  const [c] = Number.isInteger(id) ? await db.select().from(contacts).where(eq(contacts.id, id)) : [];
  if (!c) notFound();
  const [rows, open, ready] = await Promise.all([db.select().from(waMessages).where(eq(waMessages.contactId, c.id)).orderBy(asc(waMessages.createdAt)).limit(300),
    windowOpen(c.id), waReady()]);
  const wa = whatsappLink(c.phone);
  const closedFlag = (await searchParams).closed;
  return (
    <>
      <p><Link href="/admin/whatsapp">← {t.title}</Link></p>
      <header className="a-head a-request-head">
        <div><h1>{c.name}</h1><p className="a-muted" dir="ltr">{c.phone}</p></div>
        <Link className="a-btn" href={`/admin/customers/${c.id}`}>{adminDict(lang).crm.openCustomer}</Link>
      </header>
      <section className="a-panel wa-thread">
        {rows.length === 0 && <p className="a-muted">{t.none}</p>}
        {rows.map((m) => (
          <div key={m.id} className={`wa-msg ${m.direction}`}>
            <p dir="auto">{m.body}</p>
            <small>{dateTime(m.createdAt, lang)}{m.direction === "out" && ` · ${TICKS[m.status] ?? m.status}`}{m.error && ` · ${m.error}`}</small>
          </div>
        ))}
      </section>
      <section className="a-panel">
        {closedFlag && <p className="a-alert">{t.windowClosed}</p>}
        {ready && open ? (
          <form action={replyWhatsApp} className="a-inline">
            <input type="hidden" name="contactId" value={c.id} />
            <textarea name="text" rows={2} required dir="auto" placeholder={t.reply} aria-label={t.reply} style={{ flex: 1, minWidth: 240 }} />
            <button className="a-btn primary">{t.send}</button>
          </form>
        ) : (
          <p className="a-muted">{ready ? t.windowClosed : t.notConnected}
            {wa && <> <a className="a-btn wa small" href={wa} target="_blank" rel="noreferrer">💬 {t.openApp}</a></>}</p>
        )}
      </section>
    </>
  );
}
