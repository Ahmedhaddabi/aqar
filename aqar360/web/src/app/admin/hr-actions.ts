"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { employees, expenses, LEAVE_TYPES, leaves, payrollRuns, payslips, renewals } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";

const STAFF = ["admin", "manager"] as const;
const id = z.coerce.number().int().positive();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optDay = day.optional().or(z.literal("").transform(() => undefined));
const amount = z.coerce.number().min(0).max(1_000_000);
const text = (max: number) => z.string().trim().max(max).default("");
const fields = (form: FormData) => Object.fromEntries(form);

const employeeSchema = z.object({
  id: z.string().optional(), name: z.string().trim().min(2).max(120), jobTitle: text(120), phone: text(30), email: text(160),
  nationality: text(60), idNumber: text(40), idExpiry: optDay, passportExpiry: optDay, visaExpiry: optDay, joinDate: optDay,
  basicSalary: amount, allowances: amount, annualLeaveDays: z.coerce.number().int().min(0).max(90), notes: text(2000),
});

export async function saveEmployee(form: FormData) {
  const user = await requireUser([...STAFF]);
  const parsed = employeeSchema.safeParse(fields(form));
  const target = String(form.get("id") || "new");
  if (!parsed.success) redirect(`/admin/hr/employees/${target}?error=1`);
  const { id: _id, ...v } = parsed.data;
  const values = { ...v, phone: v.phone || null, email: v.email || null, idExpiry: v.idExpiry ?? null, passportExpiry: v.passportExpiry ?? null,
    visaExpiry: v.visaExpiry ?? null, joinDate: v.joinDate ?? null, active: form.get("active") === "on" };
  let employeeId = Number(target);
  if (target === "new") {
    [{ id: employeeId }] = await db.insert(employees).values(values).returning({ id: employees.id });
  } else {
    await db.update(employees).set(values).where(eq(employees.id, employeeId));
  }
  await audit(target === "new" ? "employee_created" : "employee_updated", "employee", employeeId, {}, user.id);
  revalidatePath("/admin/hr");
  redirect(`/admin/hr/employees/${employeeId}?saved=1`);
}

export async function addLeave(form: FormData) {
  const user = await requireUser([...STAFF]);
  const parsed = z.object({ employeeId: id, type: z.enum(LEAVE_TYPES), fromDate: day, toDate: day, notes: text(500) }).safeParse(fields(form));
  if (!parsed.success || parsed.data.toDate < parsed.data.fromDate) redirect("/admin/hr/leave?error=1");
  const days = Math.round((Date.parse(parsed.data.toDate) - Date.parse(parsed.data.fromDate)) / 86_400_000) + 1;
  const [row] = await db.insert(leaves).values({ ...parsed.data, days }).returning({ id: leaves.id });
  await audit("leave_added", "leave", row.id, { days }, user.id);
  revalidatePath("/admin/hr");
}

export async function decideLeave(form: FormData) {
  const user = await requireUser([...STAFF]);
  const parsed = z.object({ id, status: z.enum(["approved", "rejected"]) }).safeParse(fields(form));
  if (!parsed.success) return;
  await db.update(leaves).set({ status: parsed.data.status, decidedBy: user.id })
    .where(and(eq(leaves.id, parsed.data.id), eq(leaves.status, "pending")));
  await audit(`leave_${parsed.data.status}`, "leave", parsed.data.id, {}, user.id);
  revalidatePath("/admin/hr", "layout");
  revalidatePath("/admin/approvals");
}

/** One payslip per active employee from their current salary; amounts can be adjusted while the run is a draft. */
export async function prepareRun(form: FormData) {
  const user = await requireUser([...STAFF]);
  const month = String(form.get("month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) redirect("/admin/hr/payroll?error=invalid");
  const [exists] = await db.select({ id: payrollRuns.id }).from(payrollRuns).where(eq(payrollRuns.month, month));
  if (exists) redirect(`/admin/hr/payroll/${exists.id}?error=exists`);
  const people = await db.select().from(employees).where(eq(employees.active, true));
  if (!people.length) redirect("/admin/hr/payroll?error=empty");
  const [run] = await db.insert(payrollRuns).values({ month }).returning({ id: payrollRuns.id });
  await db.insert(payslips).values(people.map((e) => ({ runId: run.id, employeeId: e.id, basic: e.basicSalary, allowances: e.allowances,
    deductions: 0, net: e.basicSalary + e.allowances })));
  await audit("payroll_prepared", "payroll", run.id, { month }, user.id);
  redirect(`/admin/hr/payroll/${run.id}`);
}

export async function updatePayslip(form: FormData) {
  await requireUser([...STAFF]);
  const parsed = z.object({ id, allowances: amount, deductions: amount, notes: text(300) }).safeParse(fields(form));
  if (!parsed.success) return;
  const [row] = await db.select({ slip: payslips, status: payrollRuns.status }).from(payslips)
    .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id)).where(eq(payslips.id, parsed.data.id));
  if (!row || row.status !== "draft") return;
  const { allowances, deductions, notes } = parsed.data;
  await db.update(payslips).set({ allowances, deductions, notes, net: Math.max(0, row.slip.basic + allowances - deductions) })
    .where(eq(payslips.id, row.slip.id));
  revalidatePath(`/admin/hr/payroll/${row.slip.runId}`);
}

/** Paying a run also records the salaries as one bank expense, so the finance summary stays right. */
export async function markRunPaid(form: FormData) {
  const user = await requireUser([...STAFF]);
  const parsed = z.object({ id, paidOn: day }).safeParse(fields(form));
  if (!parsed.success) return;
  const [run] = await db.update(payrollRuns).set({ status: "paid", paidOn: parsed.data.paidOn })
    .where(and(eq(payrollRuns.id, parsed.data.id), eq(payrollRuns.status, "draft"))).returning();
  if (!run) return;
  const slips = await db.select({ net: payslips.net }).from(payslips).where(eq(payslips.runId, run.id));
  const total = slips.reduce((a, s) => a + s.net, 0);
  if (total > 0) {
    await db.insert(expenses).values({ spentOn: parsed.data.paidOn, category: "salaries", description: `Payroll ${run.month}`,
      amount: total, paidFrom: "bank", vendor: "", createdBy: user.id });
  }
  await audit("payroll_paid", "payroll", run.id, { total }, user.id);
  revalidatePath(`/admin/hr/payroll/${run.id}`);
}

export async function addRenewal(form: FormData) {
  const user = await requireUser([...STAFF]);
  const parsed = z.object({ title: z.string().trim().min(2).max(160), category: text(30), expiresOn: day, notes: text(500) }).safeParse(fields(form));
  if (!parsed.success) redirect("/admin/hr/renewals?error=1");
  const [row] = await db.insert(renewals).values(parsed.data).returning({ id: renewals.id });
  await audit("renewal_added", "renewal", row.id, {}, user.id);
  revalidatePath("/admin/hr");
  revalidatePath("/admin");
}

/** "Renewed until" moves the date forward; "remove" hides an item that is no longer needed. */
export async function updateRenewal(form: FormData) {
  const user = await requireUser([...STAFF]);
  const parsed = z.object({ id, expiresOn: optDay, remove: z.string().optional() }).safeParse(fields(form));
  if (!parsed.success) return;
  if (parsed.data.remove) await db.update(renewals).set({ done: true }).where(eq(renewals.id, parsed.data.id));
  else if (parsed.data.expiresOn) await db.update(renewals).set({ expiresOn: parsed.data.expiresOn }).where(eq(renewals.id, parsed.data.id));
  await audit(parsed.data.remove ? "renewal_removed" : "renewal_renewed", "renewal", parsed.data.id, {}, user.id);
  revalidatePath("/admin/hr");
  revalidatePath("/admin");
}
