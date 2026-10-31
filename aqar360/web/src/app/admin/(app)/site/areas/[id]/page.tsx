import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { adminDict, adminLang } from "@/admin/i18n";
import { Field, Section, Toggle } from "@/admin/ListingParts";
import { AreaMapEditor } from "@/admin/site-ui";
import { db } from "@/db";
import { areas, wilayats } from "@/db/schema";
import { requireApp } from "@/lib/auth";

import { saveArea } from "../../../../site-actions";

export default async function AreaPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).site;
  const raw = (await params).id;
  const [area] = raw === "new" ? [] : await db.select().from(areas).where(eq(areas.id, Number(raw) || 0));
  if (raw !== "new" && !area) notFound();
  const wilayatRows = await db.select().from(wilayats).orderBy(asc(wilayats.nameEn));
  const q = await searchParams;
  return (
    <>
      <p><Link href="/admin/site?tab=areas">← {t.tabs.areas}</Link></p>
      <header className="a-head a-request-head">
        <h1>{area ? (lang === "ar" ? area.nameAr : area.nameEn) : t.addArea}</h1>
        {area?.active && <a className="a-btn" href={`/${lang}/map`} target="_blank" rel="noreferrer">{t.view} ↗</a>}
      </header>
      {q.saved && <p className="a-ok">{t.saved}</p>}
      {q.error && <p className="a-alert">{q.error === "slug" ? t.slugTaken : t.invalid}</p>}
      <form action={saveArea} className="a-form a-listing-form">
        <input type="hidden" name="id" value={area?.id ?? "new"} />
        <Section title={t.tabs.areas}>
          <div className="a-grid-fields">
            <Field label={t.nameAr}><input name="nameAr" defaultValue={area?.nameAr} required minLength={2} dir="rtl" /></Field>
            <Field label={t.nameEn}><input name="nameEn" defaultValue={area?.nameEn} required minLength={2} dir="ltr" /></Field>
            <Field label={t.wilayat}>
              <select name="wilayatId" defaultValue={area?.wilayatId ?? ""}>
                <option value="">—</option>
                {wilayatRows.map((w) => <option key={w.id} value={w.id}>{lang === "ar" ? w.nameAr : w.nameEn}</option>)}
              </select>
            </Field>
            <Field label={t.slug} help={t.slugHelp}><input name="slug" defaultValue={area?.slug} dir="ltr" pattern="[a-z0-9\-]*" /></Field>
            <Toggle name="active" label={t.active} checked={area?.active ?? true} />
          </div>
        </Section>
        <Section title={`${t.centre} · ${t.boundary}`}>
          <AreaMapEditor lat={area?.lat ?? null} lng={area?.lng ?? null} boundary={area?.boundary ?? null} t={t} />
        </Section>
        <div className="a-savebar"><button className="a-btn primary">{t.save}</button></div>
      </form>
    </>
  );
}
