import type { Metadata } from "next";

import { ApplyForm } from "@/components/forms/ApplyForm";
import { JsonLd } from "@/components/JsonLd";
import { home, PageHead } from "@/components/PageHead";
import { getDictionary } from "@/i18n/dictionaries";
import { companyName, siteUrl } from "@/lib/config";
import { getContact, getJobs } from "@/lib/content";
import { captchaRequired } from "@/lib/intake";
import { type LangParams, langOf } from "@/lib/params";
import { pageMetadata } from "@/lib/seo";

const PATH = "/careers";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  const t = getDictionary(lang).pages.careers;
  return pageMetadata(lang, PATH, t.title, t.description);
}

export default async function CareersPage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const t = dict.pages.careers;
  const [jobs, contact] = await Promise.all([getJobs(lang), getContact()]);
  // JobPosting only for real open vacancies with a closing date (§10.1, §15.3).
  const postings = jobs.filter((j) => j.closes_on).map((j) => ({
    "@context": "https://schema.org", "@type": "JobPosting", title: j.job_title, description: j.description,
    datePosted: j.posted_on, validThrough: j.closes_on, employmentType: j.employment_type,
    hiringOrganization: { "@type": "Organization", name: companyName[lang], sameAs: siteUrl },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: j.location, addressCountry: "OM" } },
  }));
  return (
    <>
      <PageHead lang={lang} title={t.title} summary={t.summary}
        crumbs={[home(lang, dict.nav.home), { name: t.title, path: `/${lang}${PATH}` }]} />
      <section className="container section">
        {jobs.length === 0 && <p>{t.none}</p>}
        <div className="grid two">
          {jobs.map((job) => (
            <article className="card" key={job.name}>
              <h2 style={{ fontSize: "1.2rem" }}>{job.job_title}</h2>
              {job.location && <p className="muted">{job.location}</p>}
              <div className="prose" dangerouslySetInnerHTML={{ __html: job.description }} />
              {job.closes_on && <p className="muted">{t.closes}: {job.closes_on}</p>}
              <a className="btn secondary" href="#apply">{t.apply}</a>
            </article>
          ))}
        </div>
        <div id="apply" style={{ marginTop: 32 }}>
          <ApplyForm kind="job" lang={lang} dict={dict} jobs={jobs.map((j) => ({ id: j.id, title: j.job_title }))} captcha={captchaRequired()} />
        </div>
        {contact.email && <p className="muted">{t.applyByEmail} <a href={`mailto:${contact.email}`}>{contact.email}</a></p>}
        {postings.length > 0 && <JsonLd data={postings} />}
      </section>
    </>
  );
}
