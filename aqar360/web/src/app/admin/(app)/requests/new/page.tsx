import { asc, eq } from "drizzle-orm";
import Link from "next/link";

import { FillFromMessage, IdScan } from "@/admin/AiParts";
import { siteDict } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { areas } from "@/db/schema";
import { optionLabel } from "@/i18n/dictionaries";
import { aiReady } from "@/lib/ai";
import { requireApp } from "@/lib/auth";
import { FORM_OPTIONS } from "@/lib/intake";

import { createEntry } from "../../../entry-actions";

const PURPOSES: Record<string, string[]> = { search: ["Buy", "Rent"], listing: ["Sell", "Let", "Content Only", "Market Project"], consulting: [] };

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<{ error?: string; phone?: string }> }) {
  const user = await requireApp("crm");
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.entry;
  const site = siteDict(lang);
  const q = await searchParams;
  const areaRows = await db.select().from(areas).where(eq(areas.active, true)).orderBy(asc(areas.nameEn));
  const opts = FORM_OPTIONS["Aqar Search Request"];
  const ai = await aiReady();
  return (
    <>
      <p><Link href="/admin/requests">← {T.crm.inbox}</Link></p>
      <header className="a-head"><h1>{t.title}</h1><p className="a-muted">{t.intro}</p></header>
      {q.error && <p className="a-alert">{t.invalid}</p>}
      {ai && <FillFromMessage t={T.ai} />}
      <form action={createEntry} className="a-form a-listing-form">
        <section className="a-panel">
          <h2>{t.customer}</h2>
          <div className="a-grid-fields">
            <label className="a-field"><span>{t.phone}</span><input name="phone" type="tel" required defaultValue={q.phone} dir="ltr" placeholder="9XXXXXXX" /></label>
            <label className="a-field"><span>{t.name}</span><input name="name" required minLength={2} dir="auto" /></label>
            <label className="a-field"><span>{t.email}</span><input name="email" type="email" dir="ltr" /></label>
            <label className="a-field"><span>{t.language}</span><select name="language" defaultValue="ar"><option value="ar">العربية</option><option value="en">English</option></select></label>
            <label className="a-field"><span>{T.ai.idNumber}</span><input name="idNumber" dir="ltr" maxLength={40} /></label>
            <label className="a-field"><span>{T.ai.nationality}</span><input name="nationality" dir="auto" maxLength={60} /></label>
            <label className="a-field"><span>{T.ai.idExpiry}</span><input name="idExpiry" type="date" dir="ltr" /></label>
            {ai && <div className="wide"><IdScan t={T.ai} /></div>}
            <label className="a-field"><span>{t.source}</span>
              <select name="source" defaultValue="Phone call">{Object.entries(t.sources).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
        </section>
        <section className="a-panel">
          <h2>{t.what}</h2>
          <div className="a-entry-kinds">
            <label className="a-check"><input type="radio" name="kind" value="search" defaultChecked /> {t.kinds.search}</label>
            <label className="a-check"><input type="radio" name="kind" value="listing" /> {t.kinds.listing}</label>
            <label className="a-check"><input type="radio" name="kind" value="consulting" /> {t.kinds.consulting}</label>
            <label className="a-check"><input type="radio" name="kind" value="none" /> {t.none}</label>
          </div>
          <div className="a-grid-fields" style={{ marginTop: 12 }}>
            <label className="a-field"><span>{t.purpose}</span>
              <select name="subtype" defaultValue="">
                <option value="">—</option>
                {Object.entries(PURPOSES).flatMap(([, list]) => list).map((p) => <option key={p} value={p}>{t.purposes[p] ?? p}</option>)}
              </select></label>
            <label className="a-field"><span>{t.type}</span>
              <select name="propertyType" defaultValue=""><option value="">—</option>
                {opts.property_type.map((p) => <option key={p} value={p}>{optionLabel(site, p)}</option>)}</select></label>
            <label className="a-field"><span>{t.budgetMin}</span><input name="budgetMin" type="number" min={0} /></label>
            <label className="a-field"><span>{t.budgetMax}</span><input name="budgetMax" type="number" min={0} /></label>
            <label className="a-field"><span>{t.bedrooms}</span><input name="bedrooms" type="number" min={0} max={20} /></label>
            <label className="a-field"><span>{t.timing}</span>
              <select name="timing" defaultValue=""><option value="">—</option>
                {opts.timing.map((p) => <option key={p} value={p}>{optionLabel(site, p)}</option>)}</select></label>
          </div>
          <fieldset className="a-field a-apps-pick" style={{ marginTop: 12 }}><span>{t.areas}</span>
            {areaRows.map((a) => <label key={a.id} className="a-check"><input type="checkbox" name="areas" value={a.id} /> {lang === "ar" ? a.nameAr : a.nameEn}</label>)}
          </fieldset>
          <label className="a-field" style={{ marginTop: 12 }}><span>{t.notes}</span><textarea name="notes" rows={3} dir="auto" /></label>
          <fieldset className="a-field a-apps-pick" style={{ marginTop: 12 }}><span>{t.consent}</span>
            {(["phone", "whatsapp", "email"] as const).map((c) => <label key={c} className="a-check"><input type="checkbox" name="consent" value={c}
              defaultChecked={c !== "email"} /> {T.crm[c === "phone" ? "call" : c]}</label>)}
          </fieldset>
          <label className="a-check" style={{ marginTop: 12 }}><input type="checkbox" name="assignMe" defaultChecked /> {t.assignMe}</label>
        </section>
        <div className="a-savebar"><button className="a-btn primary">{t.save}</button></div>
      </form>
    </>
  );
}
