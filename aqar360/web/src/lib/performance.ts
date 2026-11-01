// Monthly performance per person: deals won, viewings done, income on their deals (our share, without client media
// money, as on the Finance page) and the commission from it, against the month's targets.
import { and, eq, gte, inArray, isNotNull, lt, ne } from "drizzle-orm";

import { db } from "@/db";
import { activities, commissionPayouts, invoices, payments, requests, targets, users } from "@/db/schema";

const OFFSET = 4 * 3_600_000;

/** Muscat month "YYYY-MM" → its start and end as moments, and as dates for payment days. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - OFFSET);
  const to = new Date(Date.UTC(y, m, 1) - OFFSET);
  const day = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
  return { from, to, fromDay: day(from), toDay: day(to) };
}
export const currentMonth = () => new Date(Date.now() + OFFSET).toISOString().slice(0, 7);

export async function performance(month: string, onlyUserId?: number) {
  const { from, to, fromDay, toDay } = monthRange(month);
  const people = await db.select({ id: users.id, name: users.name, role: users.role, apps: users.apps, pct: users.commissionPct }).from(users)
    .where(and(eq(users.active, true), ...(onlyUserId ? [eq(users.id, onlyUserId)] : [])));
  const staff = people.filter((u) => u.role === "admin" || u.apps.includes("crm"));
  const ids = staff.map((u) => u.id);
  if (!ids.length) return [];
  const [won, viewings, paid, goals, payouts] = await Promise.all([
    db.select({ userId: requests.assignedTo }).from(requests)
      .where(and(eq(requests.status, "won"), inArray(requests.assignedTo, ids), gte(requests.updatedAt, from), lt(requests.updatedAt, to))),
    db.select({ userId: activities.userId }).from(activities)
      .where(and(eq(activities.type, "viewing"), eq(activities.done, true), isNotNull(activities.result), ne(activities.result, "cancelled"),
        inArray(activities.userId, ids), gte(activities.dueAt, from), lt(activities.dueAt, to))),
    db.select({ userId: requests.assignedTo, amount: payments.amount, total: invoices.total, media: invoices.passThroughTotal }).from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id)).innerJoin(requests, eq(invoices.requestId, requests.id))
      .where(and(inArray(requests.assignedTo, ids), gte(payments.paidOn, fromDay), lt(payments.paidOn, toDay))),
    db.select().from(targets).where(and(eq(targets.month, month), inArray(targets.userId, ids))),
    db.select().from(commissionPayouts).where(and(eq(commissionPayouts.month, month), inArray(commissionPayouts.userId, ids))),
  ]);
  return staff.map((u) => {
    const income = paid.filter((p) => p.userId === u.id).reduce((a, p) => a + p.amount * (1 - (p.total ? (p.media ?? 0) / p.total : 0)), 0);
    const goal = goals.find((g) => g.userId === u.id);
    const commission = Math.round(income * (u.pct / 100) * 1000) / 1000;
    const paidOut = Math.round(payouts.filter((p) => p.userId === u.id).reduce((a, p) => a + p.amount, 0) * 1000) / 1000;
    return {
      id: u.id, name: u.name, pct: u.pct,
      won: won.filter((w) => w.userId === u.id).length,
      viewings: viewings.filter((v) => v.userId === u.id).length,
      income: Math.round(income * 1000) / 1000,
      commission, paidOut, due: Math.max(0, Math.round((commission - paidOut) * 1000) / 1000),
      target: { won: goal?.won ?? null, viewings: goal?.viewings ?? null, income: goal?.income ?? null },
    };
  }).sort((a, b) => b.income - a.income || b.won - a.won || b.viewings - a.viewings);
}
