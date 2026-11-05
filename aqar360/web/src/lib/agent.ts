// The built-in agent. Every run: (1) reads the web pages an admin listed, (2) compares those ads and our own data, and
// (3) writes suggestions for staff. It decides nothing alone: nothing reaches a customer and no record changes until a
// person presses a button, and only the fixed actions below exist. The comparing is plain rules (free, no AI needed).
import { and, asc, desc, eq, gt, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";

import { marketData } from "@/admin/market";
import { db } from "@/db";
import { activities, agentRuns, agentSources, agentSuggestions, areas, marketListings, matches, OPEN_STATUSES, properties, requests, settings } from "@/db/schema";

import { connectedReader, type FoundListing, type Fetcher, guessArea, listingsFromReader, listingsFromStructuredData, openPage, type PageReader } from "./agent-web";
import { evaluate, matchRequest } from "./matching";
import { notify } from "./notify";

const SOURCES_PER_RUN = 5;
const TIME_BUDGET_MS = 180_000;
const FRESH_DAYS = 14; // ads not seen for this long no longer count
const FORGET_DAYS = 90;
const FITS_PER_REQUEST = 3;
const MIN_COMPARABLES = 3;
const PRICE_GAP_PCT = 15;
const DROP_PCT = 5;

export type AgentDeps = { fetcher?: Fetcher; check?: (url: string) => Promise<boolean>; reader?: PageReader | null; pauseMs?: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ---- 1. Collect ----------------------------------------------------------------------------------------------------
async function saveListings(sourceId: number, found: FoundListing[], areaRows: { id: number; nameEn: string; nameAr: string }[]) {
  const now = new Date();
  let added = 0;
  for (const l of found) {
    const areaId = guessArea(l.areaText, areaRows)?.id ?? null;
    const [old] = await db.select().from(marketListings).where(eq(marketListings.url, l.url));
    if (!old) {
      await db.insert(marketListings).values({ sourceId, url: l.url, title: l.title, kind: l.kind, purpose: l.purpose, areaId, price: l.price, bedrooms: l.bedrooms, sizeSqm: l.sizeSqm });
      added++;
      continue;
    }
    const changed = l.price != null && old.price != null && l.price !== old.price;
    await db.update(marketListings).set({ title: l.title || old.title, kind: l.kind ?? old.kind, purpose: l.purpose ?? old.purpose, areaId: areaId ?? old.areaId,
      price: l.price ?? old.price, bedrooms: l.bedrooms ?? old.bedrooms, sizeSqm: l.sizeSqm ?? old.sizeSqm, lastSeenAt: now,
      ...(changed ? { previousPrice: old.price, priceChangedAt: now } : {}) }).where(eq(marketListings.id, old.id));
  }
  return added;
}

/** Reads the sources waiting longest. A page that refuses or fails only marks its own source; the run carries on. */
export async function collect(deps: AgentDeps = {}) {
  const started = Date.now();
  const sources = await db.select().from(agentSources).where(eq(agentSources.active, true)).orderBy(sql`${agentSources.lastRunAt} asc nulls first`).limit(SOURCES_PER_RUN);
  const areaRows = await db.select({ id: areas.id, nameEn: areas.nameEn, nameAr: areas.nameAr }).from(areas);
  const reader = deps.reader !== undefined ? deps.reader : await connectedReader(deps.fetcher);
  const stats = { pages: 0, ads: 0, added: 0, refused: 0 };
  for (const [i, source] of sources.entries()) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    if (i > 0) await sleep(deps.pauseMs ?? 2000);
    const page = await openPage(source.url, deps.fetcher, deps.check);
    let status: string = page.status;
    let detail = page.status === "ok" ? null : page.detail;
    let found: FoundListing[] = [];
    if (page.status === "ok") {
      stats.pages++;
      found = listingsFromStructuredData(page.html, source.url);
      if (!found.length && reader) {
        try { found = await listingsFromReader(page.html, source.url, reader); }
        catch (error) { status = (error as Error).message === "ai_limit" ? "ai_limit" : "error"; detail = (error as Error).message.slice(0, 120); }
      }
      if (status === "ok" && !found.length) { status = "empty"; detail = reader ? null : "no_ai"; }
      if (page.crawlDelay) await sleep(page.crawlDelay * 1000);
    } else stats.refused++;
    stats.ads += found.length;
    stats.added += await saveListings(source.id, found, areaRows);
    await db.update(agentSources).set({ lastRunAt: new Date(), lastStatus: status, lastDetail: detail, lastFound: found.length }).where(eq(agentSources.id, source.id));
  }
  await db.delete(marketListings).where(lt(marketListings.lastSeenAt, new Date(Date.now() - FORGET_DAYS * 86_400_000)));
  return stats;
}

// ---- 2. Compare ----------------------------------------------------------------------------------------------------
type Finding = { key: string; kind: string; score: number; data: Record<string, string | number | string[] | null>; requestId?: number; propertyId?: number; listingId?: number };

/** Everything the agent notices right now. Pure reading: this function changes nothing. */
export async function findings(): Promise<Finding[]> {
  const out: Finding[] = [];
  const freshSince = new Date(Date.now() - FRESH_DAYS * 86_400_000);
  const [open, ads, areaRows, matchRows, targetRow] = await Promise.all([
    db.select().from(requests).where(inArray(requests.status, [...OPEN_STATUSES])),
    db.select().from(marketListings).where(gt(marketListings.lastSeenAt, freshSince)),
    db.select().from(areas),
    db.select({ requestId: matches.requestId, status: matches.status }).from(matches).where(inArray(matches.status, ["suggested", "approved", "sent"])),
    db.select().from(settings).where(eq(settings.key, "firstResponseHours")),
  ]);
  const areaById = new Map(areaRows.map((a) => [a.id, a]));
  const wilayats = new Map(areaRows.map((a) => [a.id, a.wilayatId]));
  const areaData = (id: number | null) => ({ areaEn: id ? areaById.get(id)?.nameEn ?? "" : "", areaAr: id ? areaById.get(id)?.nameAr ?? "" : "" });
  const replyHours = Number(targetRow[0]?.value) || 2;

  for (const r of open) {
    const base = { number: r.number };
    if (r.status === "new" && !r.firstResponseAt && r.createdAt.getTime() < Date.now() - replyHours * 3_600_000) {
      out.push({ key: `late_reply:${r.id}`, kind: "late_reply", score: 95, requestId: r.id, data: { ...base, hours: Math.round((Date.now() - r.createdAt.getTime()) / 3_600_000) } });
    }
    const mine = matchRows.filter((m) => m.requestId === r.id);
    const waiting = mine.filter((m) => m.status === "suggested").length;
    if (waiting) out.push({ key: `review_matches:${r.id}`, kind: "review_matches", score: 85, requestId: r.id, data: { ...base, n: waiting } });
    if (r.kind !== "search") continue;
    if (!mine.length && r.createdAt.getTime() < Date.now() - 86_400_000) out.push({ key: `no_match:${r.id}`, kind: "no_match", score: 60, requestId: r.id, data: base });
    // Ads on the market that would suit this request: judged by the same rules as our own listings.
    const fits = ads.flatMap((ad) => {
      if (!ad.kind || !ad.purpose || !ad.price) return [];
      const result = evaluate(r, { key: `m${ad.id}`, propertyId: null, unitTypeId: null, projectId: null, kind: ad.kind, sale: ad.purpose === "sale" ? ad.price : null,
        rent: ad.purpose === "rent" ? ad.price : null, purpose: ad.purpose, areaId: ad.areaId, bedrooms: ad.bedrooms, size: ad.sizeSqm, construction: null, verified: false }, wilayats);
      return result && result.matchType !== "interest" ? [{ ad, result }] : [];
    }).sort((a, b) => b.result.score - a.result.score).slice(0, FITS_PER_REQUEST);
    for (const { ad, result } of fits) {
      out.push({ key: `market_fit:${r.id}:${ad.id}`, kind: "market_fit", score: Math.min(80, result.score), requestId: r.id, listingId: ad.id,
        data: { ...base, title: ad.title, price: ad.price, url: ad.url, reasons: result.reasons, ...areaData(ad.areaId) } });
    }
  }

  // Our own listings against what the market asks for the same type and purpose in the same area.
  const own = await db.select().from(properties).where(and(eq(properties.status, "available"), isNull(properties.projectId)));
  for (const p of own) {
    for (const purpose of ["sale", "rent"] as const) {
      const ours = purpose === "sale" ? p.salePrice : p.rentPrice;
      if (!ours || !p.areaId || p.purpose === (purpose === "sale" ? "rent" : "sale")) continue;
      const same = ads.filter((a) => a.areaId === p.areaId && a.kind === p.kind && a.purpose === purpose && a.price).map((a) => a.price!);
      if (same.length < MIN_COMPARABLES) continue;
      const mid = median(same);
      const pct = Math.round(((ours - mid) / mid) * 100);
      if (Math.abs(pct) < PRICE_GAP_PCT) continue;
      out.push({ key: `price:${p.id}:${purpose}`, kind: pct > 0 ? "price_high" : "price_low", score: 55, propertyId: p.id,
        data: { title: p.title || p.code, ours, median: mid, pct: Math.abs(pct), n: same.length, purpose, ...areaData(p.areaId) } });
    }
  }

  for (const ad of ads) {
    if (!ad.price || !ad.previousPrice || !ad.priceChangedAt || ad.priceChangedAt < new Date(Date.now() - 7 * 86_400_000)) continue;
    const pct = Math.round(((ad.previousPrice - ad.price) / ad.previousPrice) * 100);
    if (pct >= DROP_PCT) out.push({ key: `price_drop:${ad.id}:${ad.price}`, kind: "price_drop", score: 50, listingId: ad.id,
      data: { title: ad.title, price: ad.price, before: ad.previousPrice, pct, url: ad.url, ...areaData(ad.areaId) } });
  }

  const { stats } = await marketData(90);
  for (const a of stats) {
    if (a.gap >= 2) out.push({ key: `demand_gap:${a.id}`, kind: "demand_gap", score: 45, data: { n: a.demand, have: a.supply, areaEn: a.nameEn, areaAr: a.nameAr } });
  }
  return out;
}

/** Writes findings: new ones appear, ones no longer true leave the list, and a person's decision is never overwritten. */
export async function syncSuggestions(found: Finding[]) {
  let added = 0;
  for (const f of found) {
    const values = { kind: f.kind, score: f.score, data: f.data, requestId: f.requestId ?? null, propertyId: f.propertyId ?? null, listingId: f.listingId ?? null };
    const [row] = await db.insert(agentSuggestions).values({ key: f.key, ...values }).onConflictDoNothing().returning({ id: agentSuggestions.id });
    if (row) { added++; continue; }
    await db.update(agentSuggestions).set({ ...values, status: "new" }).where(and(eq(agentSuggestions.key, f.key), eq(agentSuggestions.status, "expired")));
    await db.update(agentSuggestions).set(values).where(and(eq(agentSuggestions.key, f.key), eq(agentSuggestions.status, "new")));
  }
  await db.update(agentSuggestions).set({ status: "expired" }).where(and(eq(agentSuggestions.status, "new"),
    found.length ? notInArray(agentSuggestions.key, found.map((f) => f.key)) : undefined));
  return added;
}

// ---- A run ----------------------------------------------------------------------------------------------------------
export async function runAgent(trigger: "daily" | "manual" | "hourly", deps: AgentDeps = {}) {
  const [run] = await db.insert(agentRuns).values({ trigger }).returning();
  const web = trigger === "hourly" ? { pages: 0, ads: 0, added: 0, refused: 0 } : await collect(deps);
  const found = await findings();
  const suggested = await syncSuggestions(found);
  const [{ open }] = await db.select({ open: sql<number>`count(*)::int` }).from(agentSuggestions).where(eq(agentSuggestions.status, "new"));
  const stats = { ...web, suggested, open };
  await db.update(agentRuns).set({ finishedAt: new Date(), stats }).where(eq(agentRuns.id, run.id));
  if (suggested) await notify({ app: "crm", roles: ["admin", "manager"] }, { kind: "agent", title: String(suggested), href: "/admin/agents", key: `agent:${run.id}` });
  return stats;
}

/** Comparing our own data stays current during the day: at most hourly, after an admin page is sent. The web is read only by the daily run or "Run now". */
export async function maybeRunAgent() {
  const claimed = await db.execute(sql`insert into ${settings} (key, value) values ('agentRunAt', to_jsonb(now()::text))
    on conflict (key) do update set value = excluded.value
    where (${settings.value} #>> '{}')::timestamptz < now() - interval '1 hour' returning key`);
  if (claimed.length) await runAgent("hourly");
}

// ---- 3. Actions: only these exist, and only a person can start them ------------------------------------------------
export const AGENT_ACTIONS: Record<string, ("followup" | "rematch")[]> = {
  late_reply: ["followup"], review_matches: [], no_match: ["rematch", "followup"], market_fit: ["followup"], price_high: [], price_low: [], price_drop: [], demand_gap: [],
};

export async function decideSuggestion(id: number, action: "followup" | "rematch" | "done" | "dismiss", userId: number, followUpText = "") {
  const [s] = await db.select().from(agentSuggestions).where(and(eq(agentSuggestions.id, id), eq(agentSuggestions.status, "new")));
  if (!s) return false;
  if (action === "followup" || action === "rematch") {
    if (!AGENT_ACTIONS[s.kind]?.includes(action) || !s.requestId) return false;
    const [r] = await db.select().from(requests).where(eq(requests.id, s.requestId));
    if (!r) return false;
    if (action === "rematch") await matchRequest(r.id);
    else await db.insert(activities).values({ requestId: r.id, contactId: r.contactId, userId, type: "follow_up", body: followUpText.slice(0, 1000), dueAt: new Date(Date.now() + 86_400_000) });
  }
  await db.update(agentSuggestions).set({ status: action === "dismiss" ? "dismissed" : "done", decidedBy: userId, decidedAt: new Date() }).where(eq(agentSuggestions.id, id));
  return true;
}

// ---- For the pages --------------------------------------------------------------------------------------------------
export const agentInbox = (status: "new" | "done" | "dismissed") => db.select().from(agentSuggestions).where(eq(agentSuggestions.status, status))
  .orderBy(desc(agentSuggestions.score), desc(agentSuggestions.createdAt)).limit(100);
export const agentOpenCount = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(agentSuggestions).where(eq(agentSuggestions.status, "new")))[0].n;
export const lastAgentRun = async () => (await db.select().from(agentRuns).orderBy(desc(agentRuns.startedAt)).limit(1))[0] ?? null;
export const agentSourceList = () => db.select().from(agentSources).orderBy(asc(agentSources.name));
export const recentListings = () => db.select().from(marketListings).orderBy(desc(marketListings.lastSeenAt)).limit(60);
