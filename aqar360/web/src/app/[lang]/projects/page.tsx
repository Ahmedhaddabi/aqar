import type { Metadata } from "next";
import Link from "next/link";

import { home, PageHead } from "@/components/PageHead";
import { getDictionary } from "@/i18n/dictionaries";
import { getProjects } from "@/lib/content";
import { formatters } from "@/lib/format";
import { type LangParams, langOf } from "@/lib/params";
import { pageMetadata } from "@/lib/seo";

const PATH = "/projects";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  const t = getDictionary(lang).pages.projects;
  return pageMetadata(lang, PATH, t.title, t.description);
}

export default async function ProjectsPage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const t = dict.pages.projects;
  const m = dict.pages.map;
  const fmt = formatters(lang);
  const projects = await getProjects(lang);
  return (
    <>
      <PageHead lang={lang} title={t.title} summary={t.summary}
        crumbs={[home(lang, dict.nav.home), { name: t.title, path: `/${lang}${PATH}` }]} />
      <section className="container section">
        {projects.length === 0 ? <p>{t.empty}</p> : (
          <ul className="project-grid">
            {projects.map((p) => (
              <li key={p.id}>
                <Link className="project-card" href={`/${lang}/projects/${p.slug}`}>
                  {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span className="project-card-image" aria-hidden="true" />}
                  <span className="project-card-body">
                    {p.construction_status && <span className="tag">{m.statuses[p.construction_status] || p.construction_status}</span>}
                    <strong>{p.title}</strong>
                    <span className="muted">{[p.area_name, p.developer].filter(Boolean).join(" · ")}</span>
                    <span className="price">{p.price_from ? `${m.from} ${fmt.amount(p.price_from)} ${m.currency}` : m.priceOnRequest}</span>
                    {p.available_units ? <span className="muted">{fmt.count(m.unitsAvailable, p.available_units)}</span> : null}
                    <span className="project-card-link">{t.viewProject}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
