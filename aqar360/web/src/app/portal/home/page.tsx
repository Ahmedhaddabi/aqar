import { and, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { contacts, documents, invoices, payments, requests, serviceJobs } from "@/db/schema";
import { docLink, jobLink, receiptLink, validPortalLink } from "@/lib/doc-link";
import { customerStatus } from "@/lib/intake";

import { ViewingsAndSuggestions } from "../Viewings";

const KIND: Record<string, string> = { search: "أبحث عن عقار · Property search", listing: "تسويق عقاري · Market my property", consulting: "استشارة · Consulting" };
const JOB: Record<string, string> = { new: "جديد · New", scheduled: "مجدول · Scheduled", in_progress: "قيد التنفيذ · In progress",
  waiting_client: "بانتظارك · Waiting for you", review: "بانتظار اعتمادك · Waiting for your approval", completed: "مكتمل · Completed", cancelled: "ملغى · Cancelled" };
const INV: Record<string, string> = { sent: "مستحقة · Due", partly_paid: "مدفوعة جزئيا · Partly paid", paid: "مدفوعة · Paid", accepted: "مقبول · Accepted",
  declined: "مرفوض · Declined" };
const n3 = (v: number) => v.toFixed(3);

/** Customer dashboard (strategy §9.1 and the "customer dashboard" wireframe): requests, invoices, receipts, jobs, files. */
export default async function PortalHome({ searchParams }: { searchParams: Promise<{ c?: string; e?: string; s?: string; done?: string }> }) {
  const q = await searchParams;
  const contactId = Number(q.c);
  const exp = Number(q.e);
  if (!validPortalLink(contactId, exp, q.s)) redirect("/portal?expired=1");
  const [c] = await db.select().from(contacts).where(eq(contacts.id, contactId));
  if (!c) redirect("/portal?expired=1");
  const paid = sql<number>`coalesce((select sum(${payments.amount}) from ${payments} where ${payments.invoiceId} = ${invoices.id}), 0)::float`;
  const [reqs, docs, pays, jobs] = await Promise.all([
    db.select().from(requests).where(eq(requests.contactId, c.id)).orderBy(desc(requests.createdAt)).limit(20),
    db.select({ inv: invoices, paid }).from(invoices).where(and(eq(invoices.contactId, c.id), notInArray(invoices.status, ["draft", "cancelled"])))
      .orderBy(desc(invoices.createdAt)).limit(30),
    db.select({ p: payments, number: invoices.number }).from(payments).innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .where(eq(invoices.contactId, c.id)).orderBy(desc(payments.paidOn)).limit(30),
    db.select().from(serviceJobs).where(eq(serviceJobs.contactId, c.id)).orderBy(desc(serviceJobs.createdAt)).limit(30),
  ]);
  const jobIds = jobs.map((j) => j.id);
  const reqIds = reqs.map((r) => r.id);
  const files = await db.select().from(documents).where(and(eq(documents.shared, true), or(
    and(eq(documents.ownerType, "contact"), eq(documents.ownerId, c.id)),
    ...(jobIds.length ? [and(eq(documents.ownerType, "job"), inArray(documents.ownerId, jobIds))] : []),
    ...(reqIds.length ? [and(eq(documents.ownerType, "request"), inArray(documents.ownerId, reqIds))] : []),
  ))).orderBy(desc(documents.createdAt));
  const fileHref = (id: number) => `/portal/file/${id}?c=${c.id}&e=${exp}&s=${encodeURIComponent(q.s ?? "")}`;
  const action = jobs.filter((j) => j.status === "review" || (!j.briefAt && !["completed", "cancelled"].includes(j.status)));
  const due = docs.filter(({ inv, paid: p }) => inv.kind === "invoice" && ["sent", "partly_paid"].includes(inv.status) && inv.total - p > 0.0005);
  return (
    <>
      <header className="a-head"><h1>مرحبا {c.name} · Hello</h1></header>
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
      <ViewingsAndSuggestions p={{ c: c.id, e: exp, s: q.s ?? "" }} done={q.done} />
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
      {files.length > 0 && (
        <section className="a-panel">
          <h2>ملفاتي · My files</h2>
          <ul className="a-list">{files.map((f) => <li key={f.id}><a href={fileHref(f.id)} target="_blank" rel="noreferrer"><strong dir="auto">{f.title}</strong></a></li>)}</ul>
        </section>
      )}
    </>
  );
}
