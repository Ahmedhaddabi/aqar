import { and, arrayContains, desc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";

import { dateOnly } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { kbArticles } from "@/db/schema";
import { requireUser } from "@/lib/auth";

/** Knowledge base (strategy §26.6): everyone reads what their role may see; admins and managers write. */
export default async function KbPage({ searchParams }: { searchParams: Promise<{ q?: string; c?: string }> }) {
  const user = await requireUser();
  const lang = await adminLang(user.language);
  const t = adminDict(lang).kb;
  const { q, c } = await searchParams;
  const term = q?.trim();
  const rows = await db.select().from(kbArticles).where(and(arrayContains(kbArticles.roles, [user.role]),
    c && c in t.categories ? eq(kbArticles.category, c) : undefined,
    term ? or(ilike(kbArticles.title, `%${term}%`), ilike(kbArticles.body, `%${term}%`)) : undefined)).orderBy(desc(kbArticles.updatedAt));
  const editor = user.role !== "agent";
  return (
    <>
      <header className="a-head a-request-head">
        <div><h1>📘 {t.title}</h1><p className="a-muted">{t.intro}</p></div>
        {editor && <Link className="a-btn primary" href="/admin/kb/new">+ {t.add}</Link>}
      </header>
      <form className="a-inline a-toolbar" action="/admin/kb">
        <input name="q" defaultValue={term} placeholder={t.searchHint} aria-label={t.searchHint} style={{ flex: 1 }} />
        <select name="c" defaultValue={c ?? ""} aria-label={t.category}>
          <option value="">{t.category}</option>
          {Object.entries(t.categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="a-btn">🔍</button>
      </form>
      {rows.length === 0 ? <section className="a-panel"><p className="a-muted">{t.none}</p></section> : rows.map((a) => (
        <details key={a.id} className="a-panel a-kb" open={rows.length === 1}>
          <summary><strong dir="auto">{a.title}</strong> <span className="a-tag">{t.categories[a.category] ?? a.category}</span></summary>
          <div className="a-kb-body" dir="auto">{a.body}</div>
          <p className="a-muted">{t.updated}: {dateOnly(a.updatedAt, lang)}{a.effectiveFrom ? ` · ${t.effective}: ${dateOnly(a.effectiveFrom, lang)}` : ""}
            {editor && <> · <Link href={`/admin/kb/${a.id}`}>{t.edit}</Link></>}</p>
        </details>
      ))}
    </>
  );
}
