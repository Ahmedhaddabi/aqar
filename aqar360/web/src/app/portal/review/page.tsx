import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { contacts, reviews, settings } from "@/db/schema";
import { validReviewLink } from "@/lib/doc-link";
import { referralCode, referralUrl, saveReview } from "@/lib/reviews";

async function submit(form: FormData) {
  "use server";
  const c = Number(form.get("c"));
  const r = String(form.get("r") ?? "");
  const s = String(form.get("s") ?? "");
  if (!validReviewLink(c, r, s)) redirect("/portal?expired=1");
  const rating = Number(form.get("rating"));
  if (!(rating >= 1 && rating <= 5)) redirect(`/portal/review?c=${c}&r=${encodeURIComponent(r)}&s=${encodeURIComponent(s)}&error=1`);
  await saveReview(c, r, { rating, comment: String(form.get("comment") ?? ""), publish: form.get("publish") === "on" });
  redirect(`/portal/review?c=${c}&r=${encodeURIComponent(r)}&s=${encodeURIComponent(s)}`);
}

/** One review per deal or job, from the link in the "how did we do?" message; then the customer's invite link. */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ c?: string; r?: string; s?: string; error?: string }> }) {
  const q = await searchParams;
  const c = Number(q.c);
  const ref = q.r ?? "";
  if (!validReviewLink(c, ref, q.s)) redirect("/portal?expired=1");
  const [[contact], [done], [google]] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.id, c)),
    db.select().from(reviews).where(and(eq(reviews.contactId, c), eq(reviews.ref, ref))),
    db.select().from(settings).where(eq(settings.key, "googleReviewUrl")),
  ]);
  if (!contact) redirect("/portal?expired=1");
  if (done) {
    const link = referralUrl(await referralCode(c));
    const googleUrl = typeof google?.value === "string" && google.value.startsWith("https://") ? google.value : null;
    return (
      <>
        <header className="a-head"><h1>شكرا لك · Thank you, {contact.name}</h1></header>
        <section className="a-panel">
          <p>وصلنا تقييمك ({"★".repeat(done.rating)}). نقدّر وقتك · We received your review. Thank you for your time.</p>
          {googleUrl && done.rating >= 4 && <p><a className="a-btn primary" href={googleUrl} target="_blank" rel="noreferrer">⭐ شاركه على Google · Share it on Google</a></p>}
        </section>
        <section className="a-panel">
          <h2>🎁 ادعُ صديقا · Invite a friend</h2>
          <p>أرسل هذا الرابط لمن يبحث عن عقار أو يريد تسويق عقاره · Send this link to anyone looking for a property or wanting to market one:</p>
          <code className="a-code" dir="ltr">{link}</code>
        </section>
      </>
    );
  }
  return (
    <>
      <header className="a-head"><h1>كيف كانت تجربتك؟ · How did we do?</h1></header>
      {q.error && <p className="a-alert">اختر عدد النجوم · Please choose a rating.</p>}
      <form action={submit} className="a-panel a-form">
        <input type="hidden" name="c" value={c} /><input type="hidden" name="r" value={ref} /><input type="hidden" name="s" value={q.s} />
        <fieldset className="p-rating">
          <legend>تقييمك · Your rating</legend>
          {[5, 4, 3, 2, 1].map((n) => (
            <label key={n}><input type="radio" name="rating" value={n} required /> <span>{"★".repeat(n)}{"☆".repeat(5 - n)}</span></label>
          ))}
        </fieldset>
        <label className="a-field"><span>تعليقك (اختياري) · Your comment (optional)</span>
          <textarea name="comment" rows={4} maxLength={2000} dir="auto" /></label>
        <label className="a-check"><input type="checkbox" name="publish" /> يمكنكم نشر تقييمي في الموقع باسمي الأول · You may show my review on the website with my first name</label>
        <div className="a-savebar"><button className="a-btn primary">إرسال · Send</button></div>
      </form>
    </>
  );
}
