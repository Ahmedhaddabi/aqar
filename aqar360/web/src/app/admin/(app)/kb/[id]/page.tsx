import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { kbArticles, ROLES } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";

async function saveArticle(form: FormData) {
  "use server";
  const user = await requireUser(["admin", "manager"]);
  const target = String(form.get("id") || "new");
  const parsed = z.object({ title: z.string().trim().min(2).max(200), category: z.string().max(30), body: z.string().max(20_000).default(""),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/admin/kb/${target}?error=1`);
  const roles = ROLES.filter((r) => form.getAll("roles").includes(r));
  const values = { ...parsed.data, effectiveFrom: parsed.data.effectiveFrom ?? null, roles: roles.length ? roles : [...ROLES], updatedBy: user.id,
    updatedAt: new Date() };
  let id = Number(target);
  if (target === "new") [{ id }] = await db.insert(kbArticles).values(values).returning({ id: kbArticles.id });
  else await db.update(kbArticles).set(values).where(eq(kbArticles.id, id));
  await audit(target === "new" ? "kb_created" : "kb_updated", "kb_article", id, { title: values.title }, user.id);
  redirect("/admin/kb");
}

export default async function KbEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.kb;
  const raw = (await params).id;
  const [a] = raw === "new" ? [] : await db.select().from(kbArticles).where(eq(kbArticles.id, Number(raw) || 0));
  if (raw !== "new" && !a) notFound();
  return (
    <>
      <p><Link href="/admin/kb">← {t.title}</Link></p>
      <header className="a-head"><h1>{a?.title ?? t.add}</h1></header>
      <form action={saveArticle} className="a-form a-panel">
        <input type="hidden" name="id" value={a?.id ?? "new"} />
        <label className="a-field"><span>{t.name}</span><input name="title" defaultValue={a?.title} required minLength={2} dir="auto" /></label>
        <label className="a-field"><span>{t.category}</span>
          <select name="category" defaultValue={a?.category ?? "procedure"}>{Object.entries(t.categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="a-field"><span>{t.body}</span><textarea name="body" rows={14} defaultValue={a?.body} dir="auto" /></label>
        <label className="a-field"><span>{t.effective}</span><input type="date" name="effectiveFrom" defaultValue={a?.effectiveFrom ?? ""} /></label>
        <fieldset className="a-field a-apps-pick"><span>{t.roles}</span>
          {ROLES.map((r) => <label key={r} className="a-check"><input type="checkbox" name="roles" value={r} defaultChecked={!a || a.roles.includes(r)} /> {T.roles[r]}</label>)}
        </fieldset>
        <div><button className="a-btn primary">{t.save}</button></div>
      </form>
    </>
  );
}
