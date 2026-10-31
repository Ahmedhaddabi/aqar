import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { siteDict } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { Field, Section, Toggle } from "@/admin/ListingParts";
import { FaqEditor } from "@/admin/site-ui";
import { db } from "@/db";
import { areas, pages } from "@/db/schema";
import { requireApp } from "@/lib/auth";
import { htmlToText } from "@/lib/text";

import { savePage } from "../../../../site-actions";

export default async function ContentPageEditor({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).site;
  const types = siteDict(lang).pageTypes;
  const raw = (await params).id;
  const [page] = raw === "new" ? [] : await db.select().from(pages).where(eq(pages.id, Number(raw) || 0));
  if (raw !== "new" && !page) notFound();
  const areaRows = await db.select().from(areas).orderBy(asc(areas.nameEn));
  const q = await searchParams;
  const href = page ? `/${lang}/${page.type === "Area Guide" ? "areas" : "insights"}/${page.slug}` : null;
  return (
    <>
      <p><Link href="/admin/site?tab=pages">← {t.tabs.pages}</Link></p>
      <header className="a-head a-request-head">
        <h1>{page ? (lang === "ar" ? page.titleAr : page.titleEn) : t.addPage}</h1>
        {page?.published && href && <a className="a-btn" href={href} target="_blank" rel="noreferrer">{t.view} ↗</a>}
      </header>
      {q.saved && <p className="a-ok">{t.saved}</p>}
      {q.error && <p className="a-alert">{q.error === "slug" ? t.slugTaken : t.invalid}</p>}
      <form action={savePage} className="a-form a-listing-form">
        <input type="hidden" name="id" value={page?.id ?? "new"} />
        <Section title={t.tabs.pages}>
          <div className="a-grid-fields">
            <Field label={t.type}>
              <select name="type" defaultValue={page?.type ?? "Buying Guide"}>
                {Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label={t.area}>
              <select name="areaId" defaultValue={page?.areaId ?? ""}>
                <option value="">{t.noArea}</option>
                {areaRows.map((a) => <option key={a.id} value={a.id}>{lang === "ar" ? a.nameAr : a.nameEn}</option>)}
              </select>
            </Field>
            <Field label={t.slug} help={t.slugHelp}><input name="slug" defaultValue={page?.slug} dir="ltr" pattern="[a-z0-9\-]*" /></Field>
            <Field label={t.lastReviewed}><input type="date" name="lastReviewed" defaultValue={page?.lastReviewed ?? ""} /></Field>
            <Toggle name="published" label={t.published} checked={page?.published ?? false} />
          </div>
        </Section>
        <div className="a-two-lang">
          <Section title={t.tabs.pages + " · العربية"}>
            <Field label={t.titleAr}><input name="titleAr" defaultValue={page?.titleAr} required minLength={2} dir="rtl" /></Field>
            <Field label={t.summaryAr}><textarea name="summaryAr" rows={2} defaultValue={page?.summaryAr} dir="rtl" /></Field>
            <Field label={t.bodyAr} help={t.bodyHelp}><textarea name="bodyAr" rows={12} defaultValue={htmlToText(page?.bodyAr ?? "")} dir="rtl" /></Field>
            <Field label={t.factsAr} help={t.factsHelp}><textarea name="factsAr" rows={4} defaultValue={page?.factsAr} dir="rtl" /></Field>
          </Section>
          <Section title={t.tabs.pages + " · English"}>
            <Field label={t.titleEn}><input name="titleEn" defaultValue={page?.titleEn} required minLength={2} dir="ltr" /></Field>
            <Field label={t.summaryEn}><textarea name="summaryEn" rows={2} defaultValue={page?.summaryEn} dir="ltr" /></Field>
            <Field label={t.bodyEn} help={t.bodyHelp}><textarea name="bodyEn" rows={12} defaultValue={htmlToText(page?.bodyEn ?? "")} dir="ltr" /></Field>
            <Field label={t.factsEn} help={t.factsHelp}><textarea name="factsEn" rows={4} defaultValue={page?.factsEn} dir="ltr" /></Field>
          </Section>
        </div>
        <Section title={t.faqs}><FaqEditor initial={page?.faqs ?? []} t={t} /></Section>
        <Section title={t.sources}>
          <Field label={t.sources}><textarea name="sources" rows={3} defaultValue={page?.sources ?? ""} dir="auto" /></Field>
        </Section>
        <div className="a-savebar"><button className="a-btn primary">{t.save}</button></div>
      </form>
    </>
  );
}
