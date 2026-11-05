"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { adminDict, adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { agentSources, agentSuggestions } from "@/db/schema";
import { decideSuggestion, runAgent } from "@/lib/agent";
import { publicAddress } from "@/lib/agent-web";
import { audit, requireApp } from "@/lib/auth";

const office = () => requireApp("crm", ["admin", "manager"]);

export async function runAgentForm() {
  const user = await office();
  const stats = await runAgent("manual");
  await audit("agent_run", "agent", null, stats, user.id);
  redirect(`/admin/agents?ran=1`);
}

/** A person pressed a button on a suggestion; the action list is fixed in lib/agent.ts. */
export async function decideForm(form: FormData) {
  const user = await office();
  const parsed = z.object({ id: z.coerce.number().int(), action: z.enum(["followup", "rematch", "done", "dismiss"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { id, action } = parsed.data;
  const [s] = await db.select().from(agentSuggestions).where(eq(agentSuggestions.id, id));
  if (!s) return;
  const t = adminDict(await adminLang(user.language)).agent;
  const note = [t.kinds[s.kind]?.follow ?? t.followText, s.data.title, s.data.url].filter(Boolean).join("\n");
  if (await decideSuggestion(id, action, user.id, note)) await audit("agent_suggestion_decided", "agent_suggestion", id, { kind: s.kind, action }, user.id);
  revalidatePath("/admin/agents");
}

/** Sources are added by an admin only, who confirms the site allows reading it automatically. */
export async function addSourceForm(form: FormData) {
  const user = await requireApp("crm", ["admin"]);
  const parsed = z.object({ name: z.string().trim().min(2).max(80), url: z.string().trim().url().max(500), confirmed: z.literal("on") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/admin/agents/sources?error=invalid");
  if (!(await publicAddress(parsed.data.url))) redirect("/admin/agents/sources?error=address");
  const [row] = await db.insert(agentSources).values({ name: parsed.data.name, url: parsed.data.url, confirmedBy: user.id }).onConflictDoNothing().returning();
  if (row) await audit("agent_source_added", "agent_source", row.id, { url: row.url }, user.id);
  redirect("/admin/agents/sources?saved=1");
}

export async function toggleSourceForm(form: FormData) {
  const user = await requireApp("crm", ["admin"]);
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  await db.update(agentSources).set({ active: form.get("active") === "1" }).where(eq(agentSources.id, id));
  await audit("agent_source_changed", "agent_source", id, { active: form.get("active") === "1" }, user.id);
  revalidatePath("/admin/agents/sources");
}

/** Removing a source also removes the ads collected from it. */
export async function removeSourceForm(form: FormData) {
  const user = await requireApp("crm", ["admin"]);
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  await db.delete(agentSources).where(eq(agentSources.id, id));
  await audit("agent_source_removed", "agent_source", id, {}, user.id);
  revalidatePath("/admin/agents/sources");
}
