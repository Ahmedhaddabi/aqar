import { ownerDashboard } from "@/lib/owners";

const omr = (v: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(v);
const STATUS: Record<string, string> = { available: "معروض · On the market", reserved: "محجوز · Reserved", sold: "مباع · Sold", rented: "مؤجر · Rented",
  hidden: "غير معروض حاليا · Not on the market now" };
const RESULT: Record<string, string> = { interested: "مهتم · Interested", not_suitable: "غير مناسب · Not suitable",
  wants_alternatives: "يريد خيارات أخرى · Wanted other options", no_show: "لم يحضر · Did not come" };
const day = (at: Date | null) => (at ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Muscat" }).format(at) : "");

function Stat({ value, ar, en }: { value: number | string; ar: string; en: string }) {
  return <div className="p-stat"><strong>{value}</strong><span>{ar}</span><span className="a-muted">{en}</span></div>;
}

/** The owner's view of their own properties: how much interest there is and how the price compares (strategy §9.1 owner updates). */
export async function OwnerDashboard({ contactId }: { contactId: number }) {
  const rows = await ownerDashboard(contactId);
  if (!rows.length) return null;
  return (
    <section className="a-panel" id="my-properties">
      <h2>🏢 عقاراتي · My properties</h2>
      <p className="a-muted">ملخص الاهتمام بعقارك. لا نشارك بيانات المهتمين · A summary of interest in your property. We never share who the interested people are.</p>
      {rows.map((x) => {
        const unit = x.rent ? " / month" : "";
        const vsMarket = x.price && x.market?.median ? Math.round(((x.price - x.market.median) / x.market.median) * 100) : null;
        return (
          <article key={x.property.id} className="p-owner">
            <header>
              <h3>{x.property.kind}{x.property.bedrooms ? ` · ${x.property.bedrooms} BR` : ""} · {[x.areaAr, x.areaEn].filter(Boolean).join(" · ")}</h3>
              <span className="a-tag">{STATUS[x.property.status] ?? x.property.status}</span>
              {x.property.public && x.property.verified ? <span className="a-tag">🌐 على الموقع · On the website</span> : null}
              <span className="a-muted" dir="ltr">{x.property.code}{x.price ? ` · ${omr(x.price)} OMR${unit}` : ""}</span>
            </header>
            <div className="p-stats">
              <Stat value={x.views30} ar="مشاهدات (30 يوما)" en={`Views, 30 days (${x.views} total)`} />
              <Stat value={x.enquiries + x.suggested} ar="عملاء عُرض عليهم أو سألوا" en="Buyers it was shown to or who asked" />
              <Stat value={x.saved} ar="حفظوه" en="Saved it" />
              <Stat value={x.viewings.done} ar="معاينات تمت" en={`Viewings done${x.viewings.upcoming ? ` (+${x.viewings.upcoming} booked)` : ""}`} />
              <Stat value={x.offers.count} ar="عروض" en={x.offers.best ? `Offers (best ${omr(x.offers.best)} OMR)` : "Offers"} />
            </div>
            {x.viewings.results.length > 0 && (
              <div>
                <p><strong>آراء المعاينات · Viewing feedback</strong></p>
                <ul className="a-list">{x.viewings.results.map((r, i) => <li key={i}><span dir="ltr">{day(r.at)}</span><span>{RESULT[r.result] ?? r.result}</span></li>)}</ul>
              </div>
            )}
            <div className="p-market">
              <p><strong>📊 السوق · The market</strong></p>
              {x.market ? (
                <p>متوسط أسعار عقارات مشابهة متاحة في المنطقة: <strong dir="ltr">{omr(x.market.median!)} OMR{unit}</strong> ({x.market.count})
                  {vsMarket !== null && <> · سعرك {vsMarket === 0 ? "مطابق" : vsMarket > 0 ? `أعلى بـ ${vsMarket}%` : `أقل بـ ${-vsMarket}%`}</>}<br />
                  <span className="a-muted">Median asking price of similar available properties in the area: {omr(x.market.median!)} OMR{unit} ({x.market.count})
                    {vsMarket !== null && ` · yours is ${vsMarket === 0 ? "the same" : vsMarket > 0 ? `${vsMarket}% higher` : `${-vsMarket}% lower`}`}</span></p>
              ) : <p className="a-muted">لا توجد عقارات مشابهة كافية للمقارنة بعد · Not enough similar properties to compare yet.</p>}
              <p>عملاء يبحثون الآن في هذه المنطقة: <strong>{x.demand.looking}</strong>{x.demand.withinPrice !== null && <> · ضمن سعرك: <strong>{x.demand.withinPrice}</strong></>}<br />
                <span className="a-muted">People looking in this area now: {x.demand.looking}{x.demand.withinPrice !== null && ` · within your price: ${x.demand.withinPrice}`}</span></p>
            </div>
          </article>
        );
      })}
    </section>
  );
}
