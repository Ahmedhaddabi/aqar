import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { currentCustomer } from "@/lib/customer-auth";
import { validPortalLink } from "@/lib/doc-link";

import { linkFromPortalForm } from "../actions";
import { CustomerDashboard } from "../Dashboard";

/** A private portal link (emailed or sent by staff). A signed-in customer can add this record to their account. */
export default async function PortalHome({ searchParams }: { searchParams: Promise<{ c?: string; e?: string; s?: string; done?: string; linked?: string }> }) {
  const q = await searchParams;
  const contactId = Number(q.c);
  const exp = Number(q.e);
  if (!validPortalLink(contactId, exp, q.s)) redirect("/portal?expired=1");
  const [c] = await db.select().from(contacts).where(eq(contacts.id, contactId));
  if (!c) redirect("/portal?expired=1");
  const account = await currentCustomer();
  return (
    <>
      <header className="a-head"><h1>مرحبا {c.name} · Hello</h1></header>
      {q.linked === "0" && <p className="a-alert">حسابك مرتبط بسجل آخر؛ تواصل معنا. · Your account is linked to another record; please contact us.</p>}
      {account && account.contactId !== c.id && (
        <section className="a-panel">
          <h2>إضافة إلى حسابي · Add to my account</h2>
          <p className="a-muted">أنت مسجل الدخول باسم {account.name}. أضف هذه الطلبات لتتابعها من حسابك. · You are logged in as {account.name}. Add these requests to follow them from your account.</p>
          <form action={linkFromPortalForm}>
            <input type="hidden" name="c" value={c.id} /><input type="hidden" name="e" value={exp} /><input type="hidden" name="s" value={q.s} />
            <button className="a-btn primary">أضف إلى حسابي · Add to my account</button>
          </form>
        </section>
      )}
      <CustomerDashboard contact={c} p={{ c: c.id, e: exp, s: q.s ?? "" }} done={q.done} />
    </>
  );
}
