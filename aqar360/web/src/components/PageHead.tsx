import Link from "next/link";

import type { Locale } from "@/lib/config";
import { breadcrumbLd } from "@/lib/seo";

import { JsonLd } from "./JsonLd";

/** Page title, one H1, the answer-first summary (§13.5) and breadcrumbs with matching structured data. */
export function PageHead({ lang, title, summary, crumbs, compact }: {
  lang: Locale; title: string; summary?: string; crumbs: { name: string; path: string }[]; compact?: boolean;
}) {
  return (
    <section className={compact ? "page-head compact" : "page-head"}>
      <div className="container">
        <nav className="breadcrumbs" aria-label="breadcrumbs">
          {crumbs.map((c, i) => (
            <span key={c.path}>{i > 0 && " / "}{i < crumbs.length - 1 ? <Link href={c.path}>{c.name}</Link> : c.name}</span>
          ))}
        </nav>
        <h1>{title}</h1>
        {summary && <p className="lead">{summary}</p>}
      </div>
      <JsonLd data={breadcrumbLd(crumbs)} />
    </section>
  );
}

export const home = (lang: Locale, label: string) => ({ name: label, path: `/${lang}` });
