import { notFound } from "next/navigation";

import { validJobLink } from "@/lib/doc-link";
import { jobWithContact } from "@/lib/jobs";

import { approveJob, requestChanges, submitBrief } from "../../actions";

const STATUS: Record<string, string> = { new: "جديد · New", scheduled: "مجدول · Scheduled", in_progress: "قيد التنفيذ · In progress",
  waiting_client: "بانتظارك · Waiting for you", review: "بانتظار اعتمادك · Waiting for your approval", completed: "مكتمل · Completed", cancelled: "ملغى · Cancelled" };
const DONE: Record<string, [string, string]> = {
  brief: ["a-ok", "شكرا، وصلتنا التفاصيل. · Thank you, we received the details."],
  approved: ["a-ok", "شكرا لاعتمادك التسليم. · Thank you for approving the delivery."],
  changes: ["a-ok", "وصلنا طلب التعديل وسنعود إليك. · We received your change request and will come back to you."],
  missing: ["a-alert", "يرجى كتابة العنوان أو رابط الموقع. · Please add the address or a map link."],
};

/** The customer's job page: send details after payment, then review the delivery and approve or ask for changes. */
export default async function PortalJob({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ s?: string; done?: string }> }) {
  const id = Number((await params).id);
  const { s, done } = await searchParams;
  if (!Number.isInteger(id) || !validJobLink(id, s)) notFound();
  const data = await jobWithContact(id);
  if (!data) notFound();
  const { job } = data;
  const b = job.brief ?? {};
  const open = !["completed", "cancelled"].includes(job.status);
  const extra = job.revisionsUsed >= job.revisionsAllowed;
  const hidden = <><input type="hidden" name="id" value={job.id} /><input type="hidden" name="s" value={s} /></>;
  return (
    <>
      <header className="a-head"><h1 dir="auto">{job.title}</h1>
        <p className="a-muted"><span dir="ltr">{job.number}</span> · {STATUS[job.status]}
          {job.scheduledAt && <> · الموعد · Date: <span dir="ltr">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Muscat" }).format(job.scheduledAt)}</span></>}</p>
      </header>
      {done && DONE[done] && <p className={DONE[done][0]} role="status">{DONE[done][1]}</p>}

      {job.status === "review" && (
        <section className="a-panel p-action">
          <h2>راجع التسليم · Review the delivery</h2>
          <ul className="a-list">{job.deliverables.map((d, i) => <li key={i}><a href={d.url} target="_blank" rel="noreferrer"><strong dir="auto">{d.label}</strong> ↗</a></li>)}</ul>
          <form action={approveJob} style={{ marginTop: 12 }}>{hidden}<button className="a-btn primary">✓ أعتمد التسليم · Approve</button></form>
          <form action={requestChanges} className="a-form" style={{ marginTop: 12 }}>
            {hidden}
            <label className="a-field"><span>ما الذي تريد تعديله؟ · What should we change?</span><textarea name="reason" rows={3} required dir="auto" /></label>
            <p className="a-muted">جولات التعديل: {job.revisionsUsed} من {job.revisionsAllowed} · Revision rounds: {job.revisionsUsed} of {job.revisionsAllowed}
              {extra && " · الجولة التالية قد تكون برسوم إضافية · The next round may be charged"}</p>
            <div><button className="a-btn">اطلب تعديلات · Ask for changes</button></div>
          </form>
        </section>
      )}

      {job.status !== "review" && job.deliverables.length > 0 && (
        <section className="a-panel">
          <h2>التسليمات · Deliveries</h2>
          <ul className="a-list">{job.deliverables.map((d, i) => <li key={i}><a href={d.url} target="_blank" rel="noreferrer"><strong dir="auto">{d.label}</strong> ↗</a></li>)}</ul>
        </section>
      )}

      {open && job.status !== "review" && (
        <section className="a-panel">
          <h2>تفاصيل العمل · Job details</h2>
          <p className="a-muted">نحتاج هذه التفاصيل لترتيب الموعد. · We need these details to arrange the visit.</p>
          <form action={submitBrief} className="a-form">
            {hidden}
            <label className="a-field"><span>العنوان · Address</span><input name="address" defaultValue={b.address} dir="auto" /></label>
            <label className="a-field"><span>رابط الموقع على الخريطة · Map link</span><input name="mapLink" type="url" defaultValue={b.mapLink} dir="ltr" /></label>
            <label className="a-field"><span>الأوقات المناسبة · Suitable times</span><input name="preferredTimes" defaultValue={b.preferredTimes} dir="auto" /></label>
            <label className="a-field"><span>شخص التواصل في الموقع · Contact on site</span><input name="siteContact" defaultValue={b.siteContact} dir="auto" /></label>
            <label className="a-field"><span>هاتفه · Their phone</span><input name="sitePhone" type="tel" defaultValue={b.sitePhone} dir="ltr" /></label>
            <label className="a-field"><span>ملاحظات (المفاتيح، الإضاءة، ما يجب تصويره…) · Notes (keys, lighting, what to capture…)</span>
              <textarea name="notes" rows={4} defaultValue={b.notes} dir="auto" /></label>
            <div><button className="a-btn primary">{job.briefAt ? "تحديث التفاصيل · Update details" : "أرسل التفاصيل · Send details"}</button></div>
          </form>
        </section>
      )}
    </>
  );
}
