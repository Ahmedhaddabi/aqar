import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { adminDict, adminLang } from "@/admin/i18n";
import { Field, Section, Toggle } from "@/admin/ListingParts";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { requireApp } from "@/lib/auth";
import { htmlToText } from "@/lib/text";

import { saveJob } from "../../../../hiring-actions";

export default async function JobPostPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireApp("hr", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.hiring;
  const raw = (await params).id;
  const [job] = raw === "new" ? [] : await db.select().from(jobs).where(eq(jobs.id, Number(raw) || 0));
  if (raw !== "new" && !job) notFound();
  const q = await searchParams;
  return (
    <>
      <p><Link href="/admin/hiring?tab=posts">← {t.tabs.posts}</Link></p>
      <header className="a-head a-request-head">
        <h1>{job ? (lang === "ar" ? job.titleAr || job.titleEn : job.titleEn) : t.addPost}</h1>
        {job?.published && <a className="a-btn" href={`/${lang}/careers`} target="_blank" rel="noreferrer">{T.site.view} ↗</a>}
      </header>
      {q.saved && <p className="a-ok">{t.saved}</p>}
      {q.error && <p className="a-alert">{T.site.invalid}</p>}
      <form action={saveJob} className="a-form a-listing-form">
        <input type="hidden" name="id" value={job?.id ?? "new"} />
        <Section title={t.details}>
          <div className="a-grid-fields">
            <Field label={t.titleEn}><input name="titleEn" defaultValue={job?.titleEn} required minLength={2} dir="ltr" /></Field>
            <Field label={t.titleAr}><input name="titleAr" defaultValue={job?.titleAr} dir="rtl" /></Field>
            <Field label={t.location}><input name="location" defaultValue={job?.location ?? "Muscat"} dir="auto" /></Field>
            <Field label={t.employmentType}><input name="employmentType" defaultValue={job?.employmentType ?? "Full-time"} dir="auto" /></Field>
            <Field label={t.closesOn}><input type="date" name="closesOn" defaultValue={job?.closesOn ?? ""} /></Field>
            <Field label={t.descEn} help={T.site.bodyHelp} wide>
              <textarea name="descriptionEn" rows={8} defaultValue={htmlToText(job?.descriptionEn ?? "")} dir="ltr" /></Field>
            <Field label={t.descAr} help={T.site.bodyHelp} wide>
              <textarea name="descriptionAr" rows={8} defaultValue={htmlToText(job?.descriptionAr ?? "")} dir="rtl" /></Field>
            <Toggle name="published" label={t.published} checked={job?.published ?? false} />
          </div>
        </Section>
        <div className="a-savebar"><button className="a-btn primary">{t.save}</button></div>
      </form>
    </>
  );
}
