import { redirect } from "next/navigation";

import { validPortalLink } from "@/lib/doc-link";
import { muscatTime, slotsForMatch } from "@/lib/viewings";

import { bookViewingForm } from "../actions";

const ERRORS: Record<string, string> = {
  taken: "هذا الموعد حُجز للتو، اختر موعدا آخر · That time was just taken, please choose another.",
  limit: "لديك عدة مواعيد قادمة؛ ألغِ أحدها أو تواصل معنا · You already have several upcoming viewings; cancel one or contact us.",
  closed: "الحجز عبر الإنترنت متوقف حاليا، تواصل معنا · Online booking is paused, please contact us.",
  invalid: "لا يمكن حجز هذا العقار عبر الإنترنت · This property cannot be booked online.",
};
const dayLabel = (day: string, lang: "ar" | "en") => new Intl.DateTimeFormat(lang === "ar" ? "ar-OM" : "en-GB",
  { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/** Pick a free time for one suggested property. Times shown and booked in Muscat time. */
export default async function BookViewingPage({ searchParams }: {
  searchParams: Promise<{ c?: string; e?: string; s?: string; m?: string; replace?: string; error?: string }>;
}) {
  const q = await searchParams;
  const p = { c: Number(q.c), e: Number(q.e), s: q.s ?? "" };
  if (!validPortalLink(p.c, p.e, p.s)) redirect("/portal?expired=1");
  const back = `/portal/home?c=${p.c}&e=${p.e}&s=${encodeURIComponent(p.s)}#suggestions`;
  const data = await slotsForMatch(p.c, Number(q.m));
  return (
    <>
      <p><a href={back}>→ حسابي · My account</a></p>
      <header className="a-head"><h1>احجز موعد معاينة · Book a viewing</h1></header>
      {q.error && <p className="a-alert">{ERRORS[q.error] ?? ERRORS.invalid}</p>}
      {!data ? <p className="a-alert">{ERRORS.invalid}</p> : (
        <section className="a-panel">
          <h2>{data.p.kind}{data.p.bedrooms ? ` · ${data.p.bedrooms} BR` : ""} · <span dir="ltr">{data.p.code}</span></h2>
          <p className="a-muted">اختر اليوم والوقت (بتوقيت مسقط). مدة المعاينة {data.rules.slotMinutes} دقيقة تقريبا ·
            Choose a day and time (Muscat time). A viewing takes about {data.rules.slotMinutes} minutes.</p>
          {data.days.length === 0 ? <p className="a-alert">لا توجد مواعيد متاحة حاليا، تواصل معنا · No free times at the moment, please contact us.</p> : (
            <form action={bookViewingForm} className="p-slots">
              <input type="hidden" name="c" value={p.c} /><input type="hidden" name="e" value={p.e} /><input type="hidden" name="s" value={p.s} />
              <input type="hidden" name="match" value={Number(q.m)} />
              {q.replace && <input type="hidden" name="replace" value={Number(q.replace)} />}
              {data.days.map((d) => (
                <fieldset key={d.day}>
                  <legend>{dayLabel(d.day, "ar")} · <span dir="ltr">{dayLabel(d.day, "en")}</span></legend>
                  <div className="p-slot-row">
                    {d.slots.map((s) => (
                      <label key={s.toISOString()} className="p-slot">
                        <input type="radio" name="slot" value={s.toISOString()} required />
                        <span dir="ltr">{muscatTime(s)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <div className="a-savebar"><button className="a-btn primary">{q.replace ? "تأكيد الموعد الجديد · Confirm new time" : "تأكيد الحجز · Confirm booking"}</button></div>
            </form>
          )}
        </section>
      )}
    </>
  );
}
