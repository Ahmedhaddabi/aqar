import { siteUrl } from "@/lib/config";
import { suggestionsFor, upcomingViewings } from "@/lib/viewings";

import { cancelViewingForm, toggleSavedForm } from "./actions";

export type Portal = { c: number; e: number; s: string };
const query = (p: Portal) => `c=${p.c}&e=${p.e}&s=${encodeURIComponent(p.s)}`;
const when = (at: Date, lang: "ar" | "en") => new Intl.DateTimeFormat(lang === "ar" ? "ar-OM" : "en-GB",
  { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Asia/Muscat" }).format(at);
const omr = (v: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(v);

function PortalFields({ p }: { p: Portal }) {
  return <><input type="hidden" name="c" value={p.c} /><input type="hidden" name="e" value={p.e} /><input type="hidden" name="s" value={p.s} /></>;
}

const DONE: Record<string, string> = { booked: "✓ تم حجز الموعد وأرسلنا لك التأكيد · Viewing booked, confirmation sent",
  cancelled: "تم إلغاء الموعد · Viewing cancelled", saved: "❤ تم الحفظ · Saved", unsaved: "تمت الإزالة من المحفوظات · Removed from saved" };

/** Upcoming viewings (change or cancel) and the properties we suggested (save ❤, book a viewing). */
export async function ViewingsAndSuggestions({ p, done }: { p: Portal; done?: string }) {
  const [list, viewings] = await Promise.all([suggestionsFor(p.c), upcomingViewings(p.c)]);
  return (
    <>
      {done && DONE[done] && <p className="a-ok">{DONE[done]}</p>}
      {viewings.length > 0 && (
        <section className="a-panel" id="viewings">
          <h2>📅 مواعيد المعاينة · My viewings</h2>
          <ul className="a-list">
            {viewings.map(({ a, p: prop }) => {
              const match = list.find((x) => x.property.id === a.propertyId);
              return (
                <li key={a.id}>
                  <span><strong>{when(a.dueAt!, "ar")}</strong><br /><span className="a-muted" dir="ltr">{when(a.dueAt!, "en")}</span>
                    {prop && <><br /><span className="a-muted">{prop.kind}{prop.bedrooms ? ` · ${prop.bedrooms} BR` : ""} · <span dir="ltr">{prop.code}</span></span></>}</span>
                  <span className="a-inline">
                    {match && <a className="a-btn small" href={`/portal/book?${query(p)}&m=${match.matchId}&replace=${a.id}`}>تغيير الموعد · Change</a>}
                    <details className="p-cancel">
                      <summary className="a-btn small">إلغاء · Cancel</summary>
                      <form action={cancelViewingForm}><PortalFields p={p} /><input type="hidden" name="id" value={a.id} />
                        <button className="a-btn small danger">نعم، ألغِ الموعد · Yes, cancel it</button></form>
                    </details>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {list.length > 0 && (
        <section className="a-panel" id="suggestions">
          <h2>🏠 عقارات مقترحة لك · Suggested for you</h2>
          <div className="p-cards">
            {list.map((x) => (
              <article key={x.matchId} className="p-card">
                {x.property.coverImage ? <img src={x.property.coverImage} alt="" loading="lazy" /> : <div className="p-card-noimg" aria-hidden="true">🏠</div>}
                <div className="p-card-body">
                  <h3>{x.property.kind}{x.property.bedrooms ? ` · ${x.property.bedrooms} BR` : ""}</h3>
                  <p className="a-muted">{[x.areaAr, x.areaEn].filter(Boolean).join(" · ")}{x.projectName ? ` · ${x.projectName}` : ""}</p>
                  {x.price ? <p><strong dir="ltr">{omr(x.price)} OMR{x.rent ? " / month" : ""}</strong></p> : null}
                  <p className="a-muted"><span dir="ltr">{x.property.code}</span> · {x.requestNumber}</p>
                  {x.viewing && <p className="a-ok-text">📅 {when(x.viewing.dueAt!, "ar")}</p>}
                  <div className="a-inline">
                    {!x.viewing && <a className="a-btn primary small" href={`/portal/book?${query(p)}&m=${x.matchId}`}>احجز معاينة · Book a viewing</a>}
                    <form action={toggleSavedForm}><PortalFields p={p} /><input type="hidden" name="match" value={x.matchId} />
                      <button className={`a-btn small${x.saved ? " p-saved" : ""}`} aria-pressed={x.saved}>{x.saved ? "❤ محفوظ · Saved" : "♡ احفظ · Save"}</button></form>
                    {x.property.public && x.property.verified && (
                      <a className="a-btn small" href={`${siteUrl}/ar/map?listing=${encodeURIComponent(x.property.code)}`} target="_blank" rel="noreferrer">الموقع · Map ↗</a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
