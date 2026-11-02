import { and, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { type contacts, documents, invoices, payments, requests, serviceJobs } from "@/db/schema";
import { docLink, jobLink, receiptLink } from "@/lib/doc-link";
import { customerStatus } from "@/lib/intake";
import { referralCode, referralStats, referralUrl } from "@/lib/reviews";

import { OwnerDashboard } from "./Owner";
import { type Portal, ViewingsAndSuggestions } from "./Viewings";

const KIND: Record<string, string> = { search: "أبحث عن عقار · Property search", listing: "تسويق عقاري · Market my property", consulting: "استشارة · Consulting" };
const JOB: Record<string, string> = { new: "جديد · New", scheduled: "مجدول · Scheduled", in_progress: "قيد التنفيذ · In progress",
  waiting_client: "بانتظارك · Waiting for you", review: "بانتظار اعتمادك · Waiting for your approval", completed: "مكتمل · Completed", cancelled: "ملغى · Cancelled" };
const INV: Record<string, string> = { sent: "مستحقة · Due", partly_paid: "مدفوعة جزئيا · Partly paid", paid: "مدفوعة · Paid", accepted: "مقبول · Accepted",
  declined: "مرفوض · Declined" };
const n3 = (v: number) => v.toFixed(3);

/**
 * The customer's dashboard (strategy §9.1): actions due, viewings and suggestions, owner properties, requests, jobs,
 * invoices, receipts, invite link and shared files. Shown on a private portal link and on the signed-in "My account".
 */
export async function CustomerDashboard({ contact, p, done }: { contact: typeof contacts.$inferSelect; p: Portal; done?: string }) {
  const paid = sql<number>`coalesce((select sum(${payments.amount}) from ${payments} where ${payments.invoiceId} = ${invoices.id}), 0)::float`;
  const [reqs, docs, pays, jobs] = await Promise.all([
    db.select().from(requests).where(eq(requests.contactId, contact.id)).orderBy(desc(requests.createdAt)).limit(20),
    db.select({ inv: invoices, paid }).from(invoices).where(and(eq(invoices.contactId, contact.id), notInArray(invoices.status, ["draft", "cancelled"])))
      .orderBy(desc(invoices.createdAt)).limit(30),
    db.select({ p: payments, number: invoices.number }).from(payments).innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .where(eq(invoices.contactId, contact.id)).orderBy(desc(payments.paidOn)).limit(30),
    db.select().from(serviceJobs).where(eq(serviceJobs.contactId, contact.id)).orderBy(desc(serviceJobs.createdAt)).limit(30),
  ]);
  const invited = await referralStats(contact.id);
  const jobIds = jobs.map((j) => j.id);
  const reqIds = reqs.map((r) => r.id);
  const files = await db.select().from(documents).where(and(eq(documents.shared, true), or(
    and(eq(documents.ownerType, "contact"), eq(documents.ownerId, contact.id)),
    ...(jobIds.length ? [and(eq(documents.ownerType, "job"), inArray(documents.ownerId, jobIds))] : []),
    ...(reqIds.length ? [and(eq(documents.ownerType, "request"), inArray(documents.ownerId, reqIds))] : []),
  ))).orderBy(desc(documents.createdAt));
  const fileHref = (id: number) => `/portal/file/${id}?c=${contact.id}&e=${p.e}&s=${encodeURIComponent(p.s)}`;
  const action = jobs.filter((j) => j.status === "review" || (!j.briefAt && !["completed", "cancelled"].includes(j.status)));
  const due = docs.filter(({ inv, paid: p }) => inv.kind === "invoice" && ["sent", "partly_paid"].includes(inv.status) && inv.total - p > 0.0005);
  return (
    <>
      {(action.length > 0 || due.length > 0) && (
        <section className="a-panel p-action">
          <h2>⚠ مطلوب منك · Needs your action</h2>
          <ul className="a-list">
            {due.map(({ inv, paid: p }) => <li key={`i${inv.id}`}><a href={docLink(inv.id)}><strong dir="ltr">{inv.number}</strong> · ادفع الآن · Pay now</a>
              <span className="a-muted">{n3(inv.total - p)} OMR</span></li>)}
            {action.map((j) => <li key={`j${j.id}`}><a href={jobLink(j.id)}><strong dir="auto">{j.title}</strong> · {j.status === "review" ? "راجع واعتمد · Review and approve" : "أرسل التفاصيل · Send the details"}</a></li>)}
          </ul>
        </section>
      )}
      <ViewingsAndSuggestions p={p} done={done} />
      <OwnerDashboard contactId={contact.id} />
      <div className="a-two-lang">
        <section className="a-panel">
          <h2>طلباتي · My requests</h2>
          {reqs.length === 0 ? <p className="a-muted">—</p> : (
            <ul className="a-list">{reqs.map((r) => <li key={r.id}><strong dir="ltr">{r.number}</strong>
              <span className="a-muted">{KIND[r.kind]} · {customerStatus(r.status, "ar")} · {customerStatus(r.status, "en")}</span></li>)}</ul>
          )}
        </section>
        <section className="a-panel">
          <h2>أعمالي · My jobs</h2>
          {jobs.length === 0 ? <p className="a-muted">—</p> : (
            <ul className="a-list">{jobs.map((j) => <li key={j.id}><a href={jobLink(j.id)}><strong dir="auto">{j.title}</strong></a>
              <span className="a-muted">{JOB[j.status]}</span></li>)}</ul>
          )}
        </section>
        <section className="a-panel">
          <h2>الفواتير وعروض الأسعار · Invoices and quotes</h2>
          {docs.length === 0 ? <p className="a-muted">—</p> : (
            <ul className="a-list">{docs.map(({ inv, paid: p }) => <li key={inv.id}><a href={docLink(inv.id)}><strong dir="ltr">{inv.number}</strong></a>
              <span className="a-muted">{n3(inv.total)} OMR · {INV[inv.status] ?? inv.status}{inv.kind === "invoice" && inv.total - p > 0.0005 ? ` · ${n3(inv.total - p)} OMR` : ""}</span></li>)}</ul>
          )}
        </section>
        <section className="a-panel">
          <h2>الإيصالات · Receipts</h2>
          {pays.length === 0 ? <p className="a-muted">—</p> : (
            <ul className="a-list">{pays.map(({ p, number }) => <li key={p.id}><a href={receiptLink(p.id)}>🧾 <span dir="ltr">{number}</span> · {n3(p.amount)} OMR</a>
              <span className="a-muted" dir="ltr">{p.paidOn}</span></li>)}</ul>
          )}
        </section>
      </div>
      <section className="a-panel">
        <h2>🎁 ادعُ صديقا · Invite a friend</h2>
        <p>أرسل رابطك لمن يبحث عن عقار أو يريد تسويق عقاره · Share your link with anyone looking for a property or wanting to market one:</p>
        <code className="a-code" dir="ltr">{referralUrl(await referralCode(contact.id))}</code>
        {invited.total > 0 && <p className="a-muted">وصلنا عن طريقك {invited.total} · People who came through you: {invited.total}</p>}
      </section>
      {files.length > 0 && (
        <section className="a-panel">
          <h2>ملفاتي · My files</h2>
          <ul className="a-list">{files.map((f) => <li key={f.id}><a href={fileHref(f.id)} target="_blank" rel="noreferrer"><strong dir="auto">{f.title}</strong></a></li>)}</ul>
        </section>
      )}
    </>
  );
}
