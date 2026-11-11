// Daily counts for the Today page's "last 14 days" tiles (Muscat days), with the 14 days before for comparison.
import { and, count, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { invoices, payments, requests, waMessages } from "@/db/schema";

const DAY = 86_400_000;
const muscat = (d: Date) => new Date(d.getTime() + 4 * 3_600_000).toISOString().slice(0, 10);

export async function last14(withMoney: boolean) {
  const today = muscat(new Date());
  const days = Array.from({ length: 28 }, (_, i) => new Date(Date.parse(today) - (27 - i) * DAY).toISOString().slice(0, 10));
  const since = new Date(`${days[0]}T00:00:00+04:00`);
  const dayOf = (col: unknown) => sql<string>`to_char(${col} at time zone 'Asia/Muscat', 'YYYY-MM-DD')`;
  const [created, won, wa, paid] = await Promise.all([
    db.select({ day: dayOf(requests.createdAt), n: count() }).from(requests).where(gte(requests.createdAt, since)).groupBy(sql`1`),
    db.select({ day: dayOf(requests.updatedAt), n: count() }).from(requests).where(and(eq(requests.status, "won"), gte(requests.updatedAt, since))).groupBy(sql`1`),
    db.select({ day: dayOf(waMessages.createdAt), n: count() }).from(waMessages).where(and(eq(waMessages.direction, "in"), gte(waMessages.createdAt, since))).groupBy(sql`1`),
    withMoney ? db.select({ day: sql<string>`${payments.paidOn}::text`, n: sql<number>`sum(${payments.amount} * (1 - case when ${invoices.total} > 0
        then (coalesce(${invoices.passThroughTotal}, 0) + coalesce(${invoices.vatTotal}, 0)) / ${invoices.total} else 0 end))::float` })
      .from(payments).innerJoin(invoices, eq(payments.invoiceId, invoices.id)).where(gte(payments.paidOn, days[0])).groupBy(sql`1`) : Promise.resolve([]),
  ]);
  const series = (rows: { day: string; n: number }[]) => {
    const all = days.map((d) => Number(rows.find((r) => r.day === d)?.n ?? 0));
    const now = all.slice(14);
    const sum = (xs: number[]) => xs.reduce((a, v) => a + v, 0);
    return { values: now, total: sum(now), before: sum(all.slice(0, 14)) };
  };
  return { created: series(created), won: series(won), wa: series(wa), income: withMoney ? series(paid) : null };
}
