// Admin CRM queries. Agents see requests assigned to them plus unassigned ones they can pick up;
// managers and admins see everything.
import type { RequestKind } from "@/db/schema";
import { and, asc, count, desc, eq, ilike, inArray, isNull, lte, or, type SQL, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  activities, areas, contacts, OPEN_STATUSES, projects, properties, requests, settings, users,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";

export type InboxTab = "new" | "mine" | "open" | "closed";
const CLOSED = ["won", "closed"] as const;

/** Requests this staff member may see. */
export function visibleTo(user: CurrentUser): SQL | undefined {
  return user.role === "agent" ? or(eq(requests.assignedTo, user.id), isNull(requests.assignedTo)) : undefined;
}

export async function canSeeRequest(user: CurrentUser, requestId: number) {
  const [row] = await db.select({ id: requests.id }).from(requests).where(and(eq(requests.id, requestId), visibleTo(user)));
  return !!row;
}

export async function firstResponseHours() {
  const [row] = await db.select().from(settings).where(eq(settings.key, "firstResponseHours"));
  return Number(row?.value ?? 2);
}

export async function listRequests(user: CurrentUser, tab: InboxTab, q?: string, kind?: RequestKind) {
  const term = q?.trim();
  const search = term ? or(ilike(contacts.name, `%${term}%`), ilike(contacts.phone, `%${term.replace(/\s/g, "")}%`),
    ilike(requests.number, `%${term}%`), ilike(contacts.email, `%${term}%`)) : undefined;
  const byTab = tab === "new" ? eq(requests.status, "new")
    : tab === "mine" ? and(eq(requests.assignedTo, user.id), inArray(requests.status, [...OPEN_STATUSES]))
      : tab === "closed" ? inArray(requests.status, [...CLOSED]) : inArray(requests.status, [...OPEN_STATUSES]);
  return db.select({
    id: requests.id, number: requests.number, kind: requests.kind, subtype: requests.subtype, status: requests.status,
    propertyType: requests.propertyType, budgetMax: requests.budgetMax, createdAt: requests.createdAt,
    firstResponseAt: requests.firstResponseAt, customer: contacts.name, phone: contacts.phone, owner: users.name,
    assignedTo: requests.assignedTo,
  }).from(requests).innerJoin(contacts, eq(requests.contactId, contacts.id)).leftJoin(users, eq(requests.assignedTo, users.id))
    .where(and(byTab, search, visibleTo(user), kind ? eq(requests.kind, kind) : undefined))
    .orderBy(tab === "new" ? asc(requests.createdAt) : desc(requests.updatedAt)).limit(150);
}

export async function getRequest(user: CurrentUser, id: number) {
  const [row] = await db.select({ request: requests, contact: contacts, owner: users })
    .from(requests).innerJoin(contacts, eq(requests.contactId, contacts.id)).leftJoin(users, eq(requests.assignedTo, users.id))
    .where(and(eq(requests.id, id), visibleTo(user)));
  if (!row) return null;
  const [areaRows, project, property, timeline] = await Promise.all([
    row.request.areaIds.length ? db.select().from(areas).where(inArray(areas.id, row.request.areaIds)) : Promise.resolve([]),
    row.request.interestProjectId ? db.select().from(projects).where(eq(projects.id, row.request.interestProjectId)).then((r) => r[0]) : null,
    row.request.interestPropertyId ? db.select().from(properties).where(eq(properties.id, row.request.interestPropertyId)).then((r) => r[0]) : null,
    timelineFor({ requestId: id }),
  ]);
  return { ...row, areas: areaRows, project, property, timeline };
}

export async function timelineFor(where: { requestId?: number; contactId?: number }) {
  return db.select({ activity: activities, author: users.name, requestNumber: requests.number }).from(activities)
    .leftJoin(users, eq(activities.userId, users.id)).leftJoin(requests, eq(activities.requestId, requests.id))
    .where(where.requestId ? eq(activities.requestId, where.requestId) : eq(activities.contactId, where.contactId!))
    .orderBy(desc(activities.createdAt), desc(activities.id)).limit(200);
}

export async function activeStaff() {
  return db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.active, true)).orderBy(asc(users.name));
}

export async function listCustomers(user: CurrentUser, q?: string) {
  const term = q?.trim();
  const search = term ? or(ilike(contacts.name, `%${term}%`), ilike(contacts.phone, `%${term.replace(/\s/g, "")}%`),
    ilike(contacts.email, `%${term}%`)) : undefined;
  return db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone, email: contacts.email,
    createdAt: contacts.createdAt, requests: count(requests.id), lastRequest: sql<Date>`max(${requests.createdAt})` })
    .from(contacts).innerJoin(requests, eq(requests.contactId, contacts.id))
    .where(and(search, visibleTo(user))).groupBy(contacts.id)
    .orderBy(desc(sql`max(${requests.createdAt})`)).limit(150);
}

export async function getCustomer(user: CurrentUser, id: number) {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  if (!contact) return null;
  const customerRequests = await db.select({ id: requests.id, number: requests.number, kind: requests.kind, status: requests.status,
    createdAt: requests.createdAt, owner: users.name }).from(requests).leftJoin(users, eq(requests.assignedTo, users.id))
    .where(and(eq(requests.contactId, id), visibleTo(user))).orderBy(desc(requests.createdAt));
  if (user.role === "agent" && !customerRequests.length) return null;
  return { contact, requests: customerRequests, timeline: await timelineFor({ contactId: id }) };
}

export async function todayFor(user: CurrentUser) {
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const hours = await firstResponseHours();
  const overdueBefore = new Date(Date.now() - hours * 3_600_000);
  const mineOrAll = user.role === "agent" ? or(eq(requests.assignedTo, user.id), isNull(requests.assignedTo)) : undefined;
  const [newWaiting, overdue, due, latest] = await Promise.all([
    db.select({ n: count() }).from(requests).where(and(eq(requests.status, "new"), mineOrAll)).then((r) => r[0].n),
    db.select({ n: count() }).from(requests).where(and(eq(requests.status, "new"), lte(requests.createdAt, overdueBefore), mineOrAll))
      .then((r) => r[0].n),
    db.select({ activity: activities, requestNumber: requests.number, requestId: requests.id, customer: contacts.name })
      .from(activities).innerJoin(contacts, eq(activities.contactId, contacts.id)).leftJoin(requests, eq(activities.requestId, requests.id))
      .where(and(eq(activities.done, false), lte(activities.dueAt, endOfDay),
        user.role === "agent" ? or(eq(activities.userId, user.id), eq(requests.assignedTo, user.id)) : undefined))
      .orderBy(asc(activities.dueAt)).limit(30),
    db.select({ id: requests.id, number: requests.number, kind: requests.kind, createdAt: requests.createdAt, customer: contacts.name })
      .from(requests).innerJoin(contacts, eq(requests.contactId, contacts.id))
      .where(and(eq(requests.status, "new"), mineOrAll)).orderBy(asc(requests.createdAt)).limit(8),
  ]);
  return { newWaiting, overdue, due, latest, hours };
}
