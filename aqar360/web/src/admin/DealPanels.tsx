// Request page panels: suggested properties (approve / not suitable / sent), viewings, offers.
import { addOffer, bookViewing, decideMatch, rematch, setOfferStatus } from "@/app/admin/deal-actions";
import type { offersFor, MatchRow } from "@/admin/deals";
import { OFFER_STATUSES } from "@/db/schema";

import { money, whatsappLink } from "./format";
import type { AdminDict, AdminLang } from "./i18n";
import { fill } from "./i18n";

type T = AdminDict["match"];

const describe = (items: string[], dict: Record<string, string>) => items.map((item) => {
  const [key, value] = item.split(":");
  return fill(dict[key] ?? key, { n: value ?? "" });
});

function title(m: MatchRow, lang: AdminLang) {
  const project = m.project ? (lang === "ar" ? m.project.nameAr || m.project.nameEn : m.project.nameEn) : null;
  if (m.unitType) return `${project} · ${m.unitType.type}`;
  if (m.property?.projectId) return `${project} · ${m.property.unitNumber ?? m.property.code}`;
  return `${m.property?.kind ?? ""} · ${m.property?.code ?? ""}`;
}

export function Suggestions({ rows, t, lang, requestId, customer }: {
  rows: MatchRow[]; t: T; lang: AdminLang; requestId: number;
  customer: { name: string; phone: string | null; number: string; siteUrl: string };
}) {
  const visible = rows.filter((r) => r.match.status !== "withdrawn");
  const wa = whatsappLink(customer.phone);
  return (
    <section className="a-panel" id="suggestions">
      <div className="a-panel-head">
        <h2>{t.title}</h2>
        <form action={rematch}><input type="hidden" name="requestId" value={requestId} /><button className="a-btn small">↻ {t.rerun}</button></form>
      </div>
      <p className="a-muted">{t.intro}</p>
      {visible.length === 0 ? <p className="a-muted">{t.none}</p> : (
        <ul className="a-matches">
          {visible.map((m) => {
            const name = title(m, lang);
            const link = m.project?.public && m.project.verified ? `${customer.siteUrl}/${lang}/projects/${m.project.slug}`
              : m.property?.public && m.property.verified ? `${customer.siteUrl}/${lang}/map?listing=${encodeURIComponent(m.property.code)}` : "";
            const share = fill(t.shareText, { name: customer.name, number: customer.number, property: name, price: money(m.match.price, lang), link });
            return (
              <li key={m.match.id} className={`m-${m.match.status}`}>
                <div className="a-match-head">
                  <strong>{name}</strong>
                  <span className={`a-score${m.match.score >= 80 ? " high" : ""}`}>{t.score} {m.match.score}</span>
                  <span className="a-tag">{t.types[m.match.matchType]}</span>
                  <span className={`a-status s-${m.match.status === "sent" ? "won" : m.match.status === "rejected" ? "closed" : "working"}`}>
                    {t.statuses[m.match.status]}</span>
                </div>
                <p className="a-muted">{[m.area ? (lang === "ar" ? m.area.nameAr : m.area.nameEn) : null, money(m.match.price, lang)].filter(Boolean).join(" · ")}</p>
                <ul className="a-reasons">
                  {describe(m.match.reasons, t.reasons).map((text) => <li key={text} className="ok">✓ {text}</li>)}
                  {describe(m.match.warnings, t.warnings).map((text) => <li key={text} className="warn">! {text}</li>)}
                </ul>
                <div className="a-inline">
                  {m.match.status === "suggested" && (
                    <form action={decideMatch}><input type="hidden" name="id" value={m.match.id} /><input type="hidden" name="decision" value="approved" />
                      <button className="a-btn small primary">{t.approve}</button></form>
                  )}
                  {m.match.status === "approved" && (
                    <>
                      {wa && <a className="a-btn small wa" href={`${wa}?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer">💬 {t.whatsappSend}</a>}
                      <form action={decideMatch}><input type="hidden" name="id" value={m.match.id} /><input type="hidden" name="decision" value="sent" />
                        <button className="a-btn small primary">{t.markSent}</button></form>
                    </>
                  )}
                  {(m.match.status === "suggested" || m.match.status === "approved") && (
                    <form action={decideMatch}><input type="hidden" name="id" value={m.match.id} /><input type="hidden" name="decision" value="rejected" />
                      <button className="a-btn small danger">{t.reject}</button></form>
                  )}
                  {m.match.status === "sent" && m.property && (
                    <form action={bookViewing} className="a-inline">
                      <input type="hidden" name="requestId" value={requestId} />
                      <input type="hidden" name="propertyId" value={m.property.id} />
                      <input type="datetime-local" name="dueAt" required aria-label={t.viewingAt} />
                      <button className="a-btn small">🗓 {t.bookViewing}</button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Offers({ rows, t, lang, requestId, choices }: {
  rows: Awaited<ReturnType<typeof offersFor>>; t: T; lang: AdminLang; requestId: number; choices: { id: number; label: string }[];
}) {
  return (
    <section className="a-panel" id="offers">
      <h2>{t.offers}</h2>
      {rows.length > 0 && (
        <ul className="a-list">
          {rows.map(({ offer: o, property }) => (
            <li key={o.id}>
              <strong>{money(o.amount, lang)}</strong>
              <span className="a-muted">{property ? `${property.kind} ${property.unitNumber ?? property.code}` : ""}
                {o.counterAmount ? ` · ${t.counter}: ${money(o.counterAmount, lang)}` : ""}</span>
              <form action={setOfferStatus} className="a-inline">
                <input type="hidden" name="id" value={o.id} />
                <select name="status" defaultValue={o.status} aria-label={t.offers}>
                  {OFFER_STATUSES.map((s) => <option key={s} value={s}>{t.offerStatuses[s]}</option>)}
                </select>
                <input type="number" name="counterAmount" min={0} placeholder={t.counter} aria-label={t.counter} />
                <button className="a-btn small">✓</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={addOffer} className="a-inline a-offer-form">
        <input type="hidden" name="requestId" value={requestId} />
        {choices.length > 0 && (
          <select name="propertyId" aria-label={t.property} defaultValue="">
            <option value="">{t.property}</option>
            {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
        <input type="number" name="amount" min={1} required placeholder={t.amount} aria-label={t.amount} />
        <input name="notes" placeholder="…" aria-label="notes" />
        <button className="a-btn small primary">+ {t.addOffer}</button>
      </form>
    </section>
  );
}
