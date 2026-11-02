import Link from "next/link";

import type { Locale } from "@/lib/config";
import { breadcrumbLd } from "@/lib/seo";

import { JsonLd } from "./JsonLd";

/** Each page keeps the same banner photo (picked from its address), so pages look different but never change on reload. */
const photoFor = (path: string) => `/img/photo-${([...path].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5) + 1}.jpg`;

/** Page title, one H1, the answer-first summary (§13.5) and breadcrumbs with matching structured data, on the blue photo banner. */
export function PageHead({ lang, title, summary, crumbs, compact }: {
  lang: Locale; title: string; summary?: string; crumbs: { name: string; path: string }[]; compact?: boolean;
}) {
  const photo = photoFor(crumbs[crumbs.length - 1]?.path ?? `/${lang}`);
  return (
    <div className="container">
      <section className={compact ? "phero compact" : "phero"} style={{ "--photo": `url(${photo})` } as React.CSSProperties}>
        <nav className="breadcrumbs" aria-label="breadcrumbs">
          {crumbs.map((c, i) => (
            <span key={c.path}>{i > 0 && " / "}{i < crumbs.length - 1 ? <Link href={c.path}>{c.name}</Link> : c.name}</span>
          ))}
        </nav>
        <h1>{title}</h1>
        {summary && <p className="lead">{summary}</p>}
        <JsonLd data={breadcrumbLd(crumbs)} />
      </section>
    </div>
  );
}

export const home = (lang: Locale, label: string) => ({ name: label, path: `/${lang}` });
