"use server";

import { eq } from "drizzle-orm";

import { adminLang } from "@/admin/i18n";
import { db } from "@/db";
import { areas } from "@/db/schema";
import { aiReady, askAssistant, type ChatTurn, draftReply, extractRequest, type Extracted, summarizeCustomer, underLimit, writeListing } from "@/lib/ai";
import { audit, requireApp } from "@/lib/auth";

type Result<T> = { ok: true; data: T } | { ok: false; error: "off" | "limit" | "failed" };

async function guard(app: "crm", action: string, roles?: ("admin" | "manager" | "agent")[]) {
  const user = await requireApp(app, roles);
  if (!(await aiReady())) return { user, error: "off" as const };
  if (!(await underLimit(user.id))) return { user, error: "limit" as const };
  await audit(action, "ai", null, {}, user.id);
  return { user, error: null };
}

/** "Fill from a message": a pasted WhatsApp / chat message becomes the new-request form (staff check it before saving). */
export async function aiExtractRequest(text: string): Promise<Result<Extracted>> {
  const g = await guard("crm", "ai_extract_request");
  if (g.error) return { ok: false, error: g.error };
  try {
    const data = await extractRequest(String(text).slice(0, 6000));
    return data ? { ok: true, data } : { ok: false, error: "failed" };
  } catch (error) {
    console.error("ai extract failed:", (error as Error).message);
    return { ok: false, error: "failed" };
  }
}

/** Draft Arabic + English descriptions from what is typed in the property form. */
export async function aiDescribeProperty(facts: Record<string, string>): Promise<Result<{ ar: string; en: string }>> {
  const g = await guard("crm", "ai_describe_property", ["admin", "manager"]);
  if (g.error) return { ok: false, error: g.error };
  const keep = ["kind", "purpose", "salePrice", "rentPrice", "bedrooms", "bathrooms", "sizeSqm", "furnished", "floor", "unitType", "notes"];
  const clean: Record<string, string | number | null> = {};
  for (const k of keep) if (facts[k]) clean[k] = String(facts[k]).slice(0, 500);
  const areaId = Number(facts.areaId);
  if (Number.isInteger(areaId) && areaId > 0) {
    const [a] = await db.select({ nameEn: areas.nameEn, nameAr: areas.nameAr }).from(areas).where(eq(areas.id, areaId));
    if (a) clean.area = `${a.nameEn} / ${a.nameAr}`;
  }
  try {
    const data = await writeListing(clean);
    return data ? { ok: true, data } : { ok: false, error: "failed" };
  } catch (error) {
    console.error("ai describe failed:", (error as Error).message);
    return { ok: false, error: "failed" };
  }
}

/** The staff assistant: read-only answers from our data, limited to what this person may see. */
export async function aiAsk(history: ChatTurn[]): Promise<Result<string>> {
  const g = await guard("crm", "ai_assistant");
  if (g.error) return { ok: false, error: g.error };
  const turns = (Array.isArray(history) ? history : []).filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string");
  if (!turns.length || turns[turns.length - 1].role !== "user") return { ok: false, error: "failed" };
  try {
    return { ok: true, data: await askAssistant(turns, g.user, await adminLang(g.user.language)) };
  } catch (error) {
    console.error("ai assistant failed:", (error as Error).message);
    return { ok: false, error: "failed" };
  }
}

/** WhatsApp inbox: a reply draft in the customer's language; staff edit it and press Send themselves. */
export async function aiDraftReply(contactId: number): Promise<Result<string>> {
  const g = await guard("crm", "ai_draft_reply");
  if (g.error) return { ok: false, error: g.error };
  try {
    const data = await draftReply(Number(contactId), g.user.name);
    return data ? { ok: true, data } : { ok: false, error: "failed" };
  } catch (error) {
    console.error("ai draft reply failed:", (error as Error).message);
    return { ok: false, error: "failed" };
  }
}

/** One or two lines about the customer, in the staff member's language. */
export async function aiCustomerSummary(contactId: number): Promise<Result<string>> {
  const g = await guard("crm", "ai_customer_summary");
  if (g.error) return { ok: false, error: g.error };
  try {
    const data = await summarizeCustomer(Number(contactId), await adminLang(g.user.language));
    return data ? { ok: true, data } : { ok: false, error: "failed" };
  } catch (error) {
    console.error("ai summary failed:", (error as Error).message);
    return { ok: false, error: "failed" };
  }
}
