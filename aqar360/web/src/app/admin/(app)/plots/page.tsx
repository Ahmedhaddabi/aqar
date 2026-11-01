import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { adminDict, adminLang, fill } from "@/admin/i18n";
import { PlotsOverview } from "@/admin/PlotEditor";
import { db } from "@/db";
import { plots, properties } from "@/db/schema";
import { requireApp } from "@/lib/auth";

/** Every plot entered from a croquis, on one map and in a list (public and staff-only). */
export default async function PlotsPage() {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const t = adminDict(lang).plot;
  const rows = await db.select({ pl: plots, p: properties }).from(plots).innerJoin(properties, eq(plots.propertyId, properties.id)).orderBy(desc(plots.updatedAt));
  const list = rows.map(({ pl, p }) => ({ propertyId: p.id, code: p.code, kind: p.kind, public: pl.public, polygon: pl.polygon, areaSqm: pl.areaSqm, plotNumber: pl.plotNumber }));
  return (
    <>
      <header className="a-head"><h1>🗺 {t.mapTitle}</h1><p className="a-muted">{t.mapIntro}</p></header>
      {list.length === 0 ? <p className="a-muted">{t.none}</p> : (
        <>
          <PlotsOverview plots={list} />
          <section className="a-panel">
            <p className="a-muted">{fill(t.count, { n: list.length })}</p>
            <ul className="a-list">{list.map((x) => (
              <li key={x.propertyId}><Link href={`/admin/properties/${x.propertyId}#plot`}><strong dir="ltr">{x.code}</strong> · {x.kind}</Link>
                <span className="a-muted" dir="ltr">{x.plotNumber ? `#${x.plotNumber} · ` : ""}{Math.round(x.areaSqm).toLocaleString("en")} m²</span>
                <span className={`a-state ${x.public ? "on" : "off"}`}>{x.public ? t.shownPublic : t.staffOnly}</span></li>
            ))}</ul>
          </section>
        </>
      )}
    </>
  );
}
