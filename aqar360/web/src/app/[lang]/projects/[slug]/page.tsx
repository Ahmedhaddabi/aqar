import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/JsonLd";
import { LocationMap } from "@/components/projects/LocationMap";
import { ProjectGallery } from "@/components/projects/ProjectGallery";
import { UnitList } from "@/components/projects/UnitList";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/config";
import { getProject } from "@/lib/content";
import { fill, formatters, interestHref, unitTypeLabel } from "@/lib/format";
import { breadcrumbLd, pageMetadata, placeLd } from "@/lib/seo";

type Props = { params: Promise<{ lang: string; slug: string }> };

async function load(params: Props["params"]) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const project = await getProject(lang, slug);
  if (!project) notFound();
  return { lang: lang as Locale, slug, project };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug, project } = await load(params);
  const t = getDictionary(lang).pages.projects;
  return pageMetadata(lang, `/projects/${slug}`, project.title || t.title, project.summary || t.description);
}

/** "10% booking" lines become a proportional bar when every line starts with a percentage adding up to 100. */
function planSteps(plan: string | null | undefined) {
  const lines = (plan || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const steps = lines.map((line) => /^(\d+(?:\.\d+)?)\s*%\s*(.*)$/.exec(line));
  if (!lines.length || steps.some((s) => !s)) return { lines, steps: null };
  const parsed = steps.map((s) => ({ pct: Number(s![1]), text: s![2] }));
  return { lines, steps: Math.abs(parsed.reduce((a, s) => a + s.pct, 0) - 100) < 0.5 ? parsed : null };
}

export default async function ProjectPage({ params }: Props) {
  const { lang, slug, project: p } = await load(params);
  const dict = getDictionary(lang);
  const t = dict.pages.projects;
  const m = dict.pages.map;
  const fmt = formatters(lang);
  const path = `/${lang}/projects/${slug}`;
  const crumbs = [{ name: dict.nav.home, path: `/${lang}` }, { name: t.title, path: `/${lang}/projects` }, { name: p.title || "", path }];
  const price = p.price_from && p.price_to && p.price_to > p.price_from
    ? fill(t.priceRange, { from: fmt.amount(p.price_from), to: fmt.amount(p.price_to), currency: m.currency })
    : p.price_from ? `${m.from} ${fmt.amount(p.price_from)} ${m.currency}` : m.priceOnRequest;
  const interest = interestHref(lang, { kind: "Project", area: p.area?.id, budget: p.price_from,
    note: fill(t.interestNote, { ref: `${p.title} (${p.id})` }), listing: { type: "project", id: p.id }, source: path });
  const plan = planSteps(p.payment_plan);
  const facts = [
    [t.category, p.category ? t.categories[p.category] || p.category : null],
    [t.developer, p.developer],
    [t.status, p.construction_status ? m.statuses[p.construction_status] || p.construction_status : null],
    [t.handover, p.handover],
    [t.location, [p.area?.name, p.area?.wilayat].filter(Boolean).join(lang === "ar" ? "، " : ", ") || null],
    [t.price, price],
    [m.availability, p.available_units ? fmt.count(m.unitsAvailable, p.available_units) : null],
    [t.foreignOwnership, p.foreign_ownership_eligible ? t.foreignEligible : null],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <>
      <section className="project-hero">
        <div className="container">
          <nav className="breadcrumbs" aria-label="breadcrumbs">
            {crumbs.map((c, i) => (
              <span key={c.path}>{i > 0 && " / "}{i < crumbs.length - 1 ? <Link href={c.path}>{c.name}</Link> : c.name}</span>
            ))}
          </nav>
          <div className="project-top">
            <ProjectGallery dict={dict} title={p.title || ""} images={p.gallery} />
            <aside className="project-summary card">
              {p.construction_status && <span className="tag">{m.statuses[p.construction_status] || p.construction_status}</span>}
              <h1>{p.title}</h1>
              <p className="muted">{[p.area?.name, p.area?.wilayat].filter(Boolean).join(lang === "ar" ? "، " : ", ")}</p>
              <p className="price">{price}</p>
              {p.available_units ? <p className="project-available">{fmt.count(m.unitsAvailable, p.available_units)}</p> : null}
              {p.developer && <p className="muted">{t.developer}: {p.developer}</p>}
              <div className="project-actions">
                <Link className="btn primary" href={interest}>{t.registerInterest}</Link>
                {p.brochure && <a className="btn secondary" href={p.brochure} download>{t.brochure}</a>}
                <Link className="btn secondary" href={`/${lang}/map?listing=${encodeURIComponent(p.id)}`}>{t.viewOnMap}</Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <div className="container project-body">
        <section>
          <h2>{t.facts}</h2>
          <dl className="project-facts">
            {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </section>

        {p.description && (
          <section>
            <h2>{t.about}</h2>
            <div className="prose" dangerouslySetInnerHTML={{ __html: p.description }} />
          </section>
        )}

        {p.units && p.units.length > 0 && (
          <section>
            <h2>{t.unitTypes}</h2>
            <ul className="unit-types">
              {p.units.map((u, i) => (
                <li key={i}>
                  <strong>{unitTypeLabel(dict, lang, u.type, u.bedrooms)}</strong>
                  <span>{u.size_from ? `${fmt.amount(u.size_from)}${u.size_to ? `–${fmt.amount(u.size_to)}` : ""} ${m.sizeUnit}` : ""}</span>
                  <span className="price">{u.price_from ? `${m.from} ${fmt.amount(u.price_from)} ${m.currency}` : m.priceOnRequest}</span>
                  {u.available && <span className="tag">{fill(m.available, { n: u.available })}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {p.unit_list.length > 0 && (
          <section>
            <h2>{t.units}</h2>
            <p className="muted">{t.unitsHint}</p>
            <UnitList lang={lang} dict={dict} units={p.unit_list} project={`${p.title} (${p.id})`} projectId={p.id}
              area={p.area?.id ?? null} source={path} />
          </section>
        )}

        {plan.lines.length > 0 && (
          <section>
            <h2>{t.paymentPlan}</h2>
            {plan.steps ? (
              <ol className="plan-bar">
                {plan.steps.map((s, i) => (
                  <li key={i} style={{ flexGrow: s.pct }}><strong>{fmt.amount(s.pct)}%</strong><span>{s.text}</span></li>
                ))}
              </ol>
            ) : <ul>{plan.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
          </section>
        )}

        {p.point && (
          <section>
            <h2>{t.location}</h2>
            <LocationMap lang={lang} point={p.point} label={`${t.location}: ${p.title}`} loadingText={m.loading} />
            <div className="actions" style={{ marginTop: 12 }}>
              <Link className="btn secondary" href={`/${lang}/map?listing=${encodeURIComponent(p.id)}`}>{t.viewOnMap}</Link>
              {p.area?.guide_slug && <Link className="btn secondary" href={`/${lang}/areas/${p.area.guide_slug}`}>{t.areaGuide}</Link>}
            </div>
          </section>
        )}

        <section className="project-cta">
          <div>
            <h2>{t.ctaTitle}</h2>
            <p>{t.ctaText}</p>
          </div>
          <Link className="btn primary" href={interest}>{t.registerInterest}</Link>
        </section>
      </div>

      {/* Phones: the main action stays reachable while scrolling. */}
      <div className="project-sticky">
        <span><strong>{p.title}</strong><span>{price}</span></span>
        <Link className="btn primary" href={interest}>{t.registerInterest}</Link>
      </div>

      <JsonLd data={breadcrumbLd(crumbs)} />
      <JsonLd data={placeLd(path, p.title || "", p.summary || "", p.area?.name, p.point, p.gallery[0]?.image)} />
    </>
  );
}
