// Fair rotation of new website searches (strategy §8.3 first response): the request goes to the person in the rotation
// (Staff page: "Gets new requests") with the fewest open requests, then whoever waited longest for one. If nobody
// replies within the reassign time (Settings), it moves once to the next person. Off until switched on in Settings.
import { and, count, eq, inArray, isNull, like, lt, max, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { activities, OPEN_STATUSES, requests, settings, users } from "@/db/schema";

import { audit } from "./auth";
import { notify } from "./notify";

export async function assignRules() {
  const rows = await db.select().from(settings).where(inArray(settings.key, ["assignAuto", "reassignHours"]));
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  return { auto: get("assignAuto") === true, reassignHours: Number(get("reassignHours")) || 0 };
}

/**
 * The next person for a new request, or null when the rotation is empty. People who cover one of the request's areas
 * (Staff page) come first; when nobody covers them, everyone in the rotation is considered.
 */
export async function pickAgent(exclude: number[] = [], requestAreas: number[] = []) {
  const pool = await db.select({ id: users.id, name: users.name, role: users.role, apps: users.apps, areaIds: users.areaIds }).from(users)
    .where(and(eq(users.active, true), eq(users.receivesRequests, true), ...(exclude.length ? [notInArray(users.id, exclude)] : [])));
  const all = pool.filter((u) => u.role === "admin" || u.apps.includes("crm"));
  const local = all.filter((u) => u.areaIds.some((a) => requestAreas.includes(a)));
  const people = local.length ? local : all;
  if (!people.length) return null;
  const ids = people.map((u) => u.id);
  const [load, last] = await Promise.all([
    db.select({ id: requests.assignedTo, n: count() }).from(requests)
      .where(and(inArray(requests.assignedTo, ids), inArray(requests.status, [...OPEN_STATUSES]))).groupBy(requests.assignedTo),
    db.select({ id: requests.assignedTo, at: max(requests.createdAt) }).from(requests).where(inArray(requests.assignedTo, ids)).groupBy(requests.assignedTo),
  ]);
  const open = (id: number) => load.find((l) => l.id === id)?.n ?? 0;
  const since = (id: number) => last.find((l) => l.id === id)?.at?.getTime() ?? 0;
  return [...people].sort((a, b) => open(a.id) - open(b.id) || since(a.id) - since(b.id) || a.id - b.id)[0];
}

/** New website search → the next person, when automatic assignment is on and nobody took it yet. */
export async function autoAssign(requestId: number) {
  const rules = await assignRules();
  if (!rules.auto) return null;
  const [req] = await db.select({ areaIds: requests.areaIds }).from(requests).where(eq(requests.id, requestId));
  const agent = await pickAgent([], req?.areaIds ?? []);
  if (!agent) return null;
  const [r] = await db.update(requests).set({ assignedTo: agent.id, updatedAt: new Date() })
    .where(and(eq(requests.id, requestId), isNull(requests.assignedTo), eq(requests.kind, "search"))).returning();
  if (!r) return null;
  await db.insert(activities).values({ requestId: r.id, contactId: r.contactId, type: "system", body: `auto_assigned:${agent.id}` });
  await notify({ userIds: [agent.id] }, { kind: "request_assigned", title: r.number, href: `/admin/requests/${r.id}`, key: `request_assigned:${r.id}:${agent.id}` });
  await audit("request_auto_assigned", "request", r.id, { to: agent.id });
  return agent;
}

/** Searches still without a first reply after the reassign time move once to the next person; both are told. */
export async function reassignOverdue(now = new Date()) {
  const rules = await assignRules();
  if (!rules.reassignHours) return 0;
  const late = await db.select().from(requests).where(and(eq(requests.status, "new"), eq(requests.kind, "search"), isNull(requests.firstResponseAt),
    sql`${requests.assignedTo} is not null`, lt(requests.createdAt, new Date(now.getTime() - rules.reassignHours * 3_600_000))));
  if (!late.length) return 0;
  const moved = await db.select({ id: activities.requestId }).from(activities)
    .where(and(inArray(activities.requestId, late.map((r) => r.id)), like(activities.body, "auto_reassigned:%")));
  let done = 0;
  for (const r of late.filter((x) => !moved.some((m) => m.id === x.id))) {
    const agent = await pickAgent([r.assignedTo!], r.areaIds);
    if (!agent) continue;
    const [changed] = await db.update(requests).set({ assignedTo: agent.id, updatedAt: new Date() })
      .where(and(eq(requests.id, r.id), eq(requests.assignedTo, r.assignedTo!), isNull(requests.firstResponseAt))).returning();
    if (!changed) continue;
    await db.insert(activities).values({ requestId: r.id, contactId: r.contactId, type: "system", body: `auto_reassigned:${r.assignedTo}:${agent.id}` });
    await notify({ userIds: [agent.id] }, { kind: "request_assigned", title: r.number, href: `/admin/requests/${r.id}`, key: `request_assigned:${r.id}:${agent.id}` });
    await notify({ userIds: [r.assignedTo] }, { kind: "request_reassigned", title: r.number, href: `/admin/requests/${r.id}`, key: `request_reassigned:${r.id}` });
    await audit("request_auto_reassigned", "request", r.id, { from: r.assignedTo, to: agent.id });
    done++;
  }
  return done;
}

/**
 * Called after staff page views (and by the daily cron): runs the reassignment at most every 10 minutes. The time
 * check and the claim are one atomic statement, so two servers never run it together.
 */
export async function maybeRunAssignments() {
  const claimed = await db.execute(sql`insert into ${settings} (key, value) values ('assignRunAt', to_jsonb(now()::text))
    on conflict (key) do update set value = excluded.value
    where (${settings.value} #>> '{}')::timestamptz < now() - interval '10 minutes' returning key`);
  if (!claimed.length) return 0;
  return reassignOverdue();
}
