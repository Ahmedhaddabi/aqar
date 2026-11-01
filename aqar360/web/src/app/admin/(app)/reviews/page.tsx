import { desc, eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import Link from "next/link";

import { dateOnly } from "@/admin/format";
import { adminDict, adminLang, fill } from "@/admin/i18n";
import { db } from "@/db";
import { contacts, reviews } from "@/db/schema";
import { audit, requireApp } from "@/lib/auth";
import { referrers } from "@/lib/reviews";

async function setApproved(form: FormData) {
  "use server";
  const user = await requireApp("crm", ["admin", "manager"]);
  const id = Number(form.get("id"));
  const approved = form.get("approved") === "1";
  if (!Number.isInteger(id)) return;
  // Only reviews the customer allowed to publish can be shown.
  await db.update(reviews).set({ approved }).where(eq(reviews.id, id));
  await audit(approved ? "review_shown" : "review_hidden", "review", id, {}, user.id);
  revalidateTag("aqar-content");
  revalidatePath("/admin/reviews");
}

/** Customer reviews (approve which ones appear on the website) and who refers new customers. */
export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).reviewsAdmin;
  const tab = (await searchParams).tab === "referrals" ? "referrals" : "reviews";
  const [rows, refs] = await Promise.all([
    db.select({ r: reviews, c: contacts }).from(reviews).innerJoin(contacts, eq(reviews.contactId, contacts.id)).orderBy(desc(reviews.createdAt)).limit(300),
    referrers(),
  ]);
  const avg = rows.length ? rows.reduce((a, x) => a + x.r.rating, 0) / rows.length : 0;
  const refLink = (ref: string) => {
    const [kind, id] = ref.split(":");
    return kind === "request" ? `/admin/requests/${id}` : kind === "job" ? `/admin/jobs/${id}` : null;
  };
  return (
    <>
      <header className="a-head"><h1>⭐ {t.title}</h1><p className="a-muted">{t.intro}</p></header>
      <nav className="a-tabs a-toolbar">
        {(["reviews", "referrals"] as const).map((k) => <Link key={k} href={`/admin/reviews?tab=${k}`} aria-current={k === tab ? "page" : undefined}>{t.tabs[k]}</Link>)}
      </nav>
      {tab === "reviews" ? (
        <section className="a-panel">
          <p><strong>{rows.length ? `${avg.toFixed(1)} ★` : "—"}</strong> <span className="a-muted">{fill(t.count, { n: rows.length })}</span></p>
          {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
            <table className="a-table">
              <thead><tr><th>{t.rating}</th><th>{t.customer}</th><th>{t.comment}</th><th>{t.website}</th></tr></thead>
              <tbody>
                {rows.map(({ r, c }) => {
                  const href = refLink(r.ref);
                  return (
                    <tr key={r.id}>
                      <td data-label={t.rating}><span className="review-stars-admin">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span><div className="a-muted">{dateOnly(r.createdAt, lang)}</div></td>
                      <td data-label={t.customer}><Link href={`/admin/customers/${c.id}`}>{c.name}</Link>{href && <div><Link className="a-muted" href={href}>{r.ref}</Link></div>}</td>
                      <td data-label={t.comment} dir="auto">{r.comment || <span className="a-muted">—</span>}</td>
                      <td data-label={t.website}>
                        {!r.publish ? <span className="a-muted">{t.notAllowed}</span> : (
                          <form action={setApproved}>
                            <input type="hidden" name="id" value={r.id} /><input type="hidden" name="approved" value={r.approved ? "0" : "1"} />
                            <span className={`a-state ${r.approved ? "on" : "off"}`}>{r.approved ? t.shown : t.hidden}</span>{" "}
                            <button className="a-btn small">{r.approved ? t.hide : t.show}</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        <section className="a-panel">
          <p className="a-muted">{t.referralsIntro}</p>
          {refs.length === 0 ? <p className="a-muted">{t.none}</p> : (
            <table className="a-table">
              <thead><tr><th>{t.customer}</th><th>{t.code}</th><th>{t.referred}</th><th>{t.won}</th></tr></thead>
              <tbody>{refs.map((x) => (
                <tr key={x.id}><td data-label={t.customer}><Link href={`/admin/customers/${x.id}`}>{x.name}</Link></td>
                  <td data-label={t.code} dir="ltr">{x.code}</td><td data-label={t.referred}>{x.total}</td><td data-label={t.won}>{x.won}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}
