import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { activeStaff } from "@/admin/crm";
import { adminDict, adminLang } from "@/admin/i18n";
import { serviceChoices } from "@/admin/money";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { requireApp } from "@/lib/auth";

import { newJob } from "../../../job-actions";

/** A job without an invoice (e.g. free re-shoot, internal work for a listing). Normally jobs come from paid invoices. */
export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ contact?: string; request?: string; property?: string }> }) {
  const user = await requireApp("erp", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.jobs;
  const q = await searchParams;
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, Number(q.contact) || 0));
  if (!contact) notFound();
  const [services, staff] = await Promise.all([serviceChoices(), activeStaff()]);
  return (
    <>
      <p><Link href={`/admin/customers/${contact.id}`}>← {contact.name}</Link></p>
      <header className="a-head"><h1>{t.newJob}</h1></header>
      <form action={newJob} className="a-form a-panel">
        <input type="hidden" name="contactId" value={contact.id} />
        {q.request && <input type="hidden" name="requestId" value={q.request} />}
        {q.property && <input type="hidden" name="propertyId" value={q.property} />}
        <label className="a-field"><span>{t.service}</span>
          <select name="serviceCode" defaultValue="">
            <option value="">—</option>
            {services.map((s) => <option key={s.code} value={s.code}>{lang === "ar" ? s.nameAr : s.nameEn}</option>)}
          </select></label>
        <label className="a-field"><span>{T.money.description}</span><input name="title" required minLength={2} dir="auto" /></label>
        <label className="a-field"><span>{t.assign}</span>
          <select name="assignedTo" defaultValue=""><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <div><button className="a-btn primary">{t.create}</button></div>
      </form>
    </>
  );
}
