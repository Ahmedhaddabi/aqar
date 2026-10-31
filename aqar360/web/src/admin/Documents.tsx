import { and, desc, eq } from "drizzle-orm";

import { removeDocument, toggleShared } from "@/app/admin/doc-actions";
import { db } from "@/db";
import { type DocOwner, documents } from "@/db/schema";

import { DocumentUpload } from "./DocumentUpload";
import { dateOnly } from "./format";
import { adminDict, type AdminLang } from "./i18n";

/** Document vault panel for any record. Files open through /admin/files/<id> (access checked, every open is logged). */
export async function Documents({ ownerType, ownerId, lang, canShare = false }: { ownerType: DocOwner; ownerId: number; lang: AdminLang; canShare?: boolean }) {
  const t = adminDict(lang).docs;
  const rows = await db.select().from(documents).where(and(eq(documents.ownerType, ownerType), eq(documents.ownerId, ownerId)))
    .orderBy(desc(documents.createdAt));
  return (
    <section className="a-panel" id="documents">
      <h2>📁 {t.title}</h2>
      {rows.length === 0 ? <p className="a-muted">{t.none}</p> : (
        <ul className="a-list">
          {rows.map((d) => (
            <li key={d.id} className="a-doc-row">
              <a href={`/admin/files/${d.id}`} target="_blank" rel="noreferrer"><strong dir="auto">{d.title}</strong></a>
              <span className="a-muted">{t.categories[d.category] ?? d.category} · {dateOnly(d.createdAt, lang)} · {Math.max(1, Math.round(d.size / 1024))} KB
                {d.shared && ` · 👁 ${t.shared}`}</span>
              <span className="a-actions">
                {canShare && <form action={toggleShared}><input type="hidden" name="id" value={d.id} /><button className="a-btn small">{d.shared ? "👁 ✓" : "👁"}</button></form>}
                <form action={removeDocument}><input type="hidden" name="id" value={d.id} /><button className="a-btn small danger" aria-label={t.remove}>×</button></form>
              </span>
            </li>
          ))}
        </ul>
      )}
      <DocumentUpload ownerType={ownerType} ownerId={ownerId} t={t} canShare={canShare} />
    </section>
  );
}
