// HR queries: staff files, leave balances, payroll runs and everything that expires (staff documents, company renewals).
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { employees, leaves, payrollRuns, payslips, renewals } from "@/db/schema";

export const omanToday = () => new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);

/** Whole days from today (Oman) to the date; negative once it has passed. */
export function daysUntil(date: string | null | undefined) {
  if (!date) return null;
  return Math.round((Date.parse(date) - Date.parse(omanToday())) / 86_400_000);
}

export const listEmployees = () => db.select().from(employees).orderBy(desc(employees.active), asc(employees.name));

export async function getEmployee(id: number) {
  const [row] = await db.select().from(employees).where(eq(employees.id, id));
  return row ?? null;
}

export const listLeaves = () => db.select({ leave: leaves, name: employees.name }).from(leaves)
  .innerJoin(employees, eq(leaves.employeeId, employees.id)).orderBy(desc(leaves.fromDate)).limit(200);

/** Annual leave used this year (approved only), by employee id. */
export async function annualLeaveUsed(year = omanToday().slice(0, 4)) {
  const rows = await db.select({ id: leaves.employeeId, days: sql<number>`sum(${leaves.days})::int` }).from(leaves)
    .where(and(eq(leaves.type, "annual"), eq(leaves.status, "approved"), gte(leaves.fromDate, `${year}-01-01`), lte(leaves.fromDate, `${year}-12-31`)))
    .groupBy(leaves.employeeId);
  return new Map(rows.map((r) => [r.id, r.days]));
}

export const listRuns = () => db.select({ run: payrollRuns, people: sql<number>`count(${payslips.id})::int`,
  total: sql<number>`coalesce(sum(${payslips.net}), 0)::float` }).from(payrollRuns)
  .leftJoin(payslips, eq(payslips.runId, payrollRuns.id)).groupBy(payrollRuns.id).orderBy(desc(payrollRuns.month));

export async function getRun(id: number) {
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id));
  if (!run) return null;
  const slips = await db.select({ slip: payslips, employee: employees }).from(payslips)
    .innerJoin(employees, eq(payslips.employeeId, employees.id)).where(eq(payslips.runId, id)).orderBy(asc(employees.name));
  return { run, slips };
}

export async function getPayslip(id: number) {
  const [row] = await db.select({ slip: payslips, employee: employees, run: payrollRuns }).from(payslips)
    .innerJoin(employees, eq(payslips.employeeId, employees.id)).innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
    .where(eq(payslips.id, id));
  return row ?? null;
}

export const listRenewals = () => db.select().from(renewals).orderBy(asc(renewals.expiresOn));

export type Expiring = { key: string; title: string; doc: "id" | "passport" | "visa" | null; date: string; days: number; href: string };

/** Staff documents and company renewals ending within `days` (or already ended), soonest first. */
export async function expiringSoon(days = 30): Promise<Expiring[]> {
  const [people, items] = await Promise.all([db.select().from(employees).where(eq(employees.active, true)),
    db.select().from(renewals).where(eq(renewals.done, false))]);
  const out: Expiring[] = [];
  for (const e of people) {
    for (const [doc, date] of [["id", e.idExpiry], ["passport", e.passportExpiry], ["visa", e.visaExpiry]] as const) {
      const left = daysUntil(date);
      if (left !== null && left <= days) out.push({ key: `e${e.id}${doc}`, title: e.name, doc, date: date!, days: left, href: `/admin/hr/employees/${e.id}` });
    }
  }
  for (const r of items) {
    const left = daysUntil(r.expiresOn)!;
    if (left <= days) out.push({ key: `r${r.id}`, title: r.title, doc: null, date: r.expiresOn, days: left, href: "/admin/hr/renewals" });
  }
  return out.sort((a, b) => a.days - b.days);
}
