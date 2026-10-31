"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { JOB_STATUSES, serviceJobs } from "@/db/schema";
import { audit, requireApp } from "@/lib/auth";
import { jobLink } from "@/lib/doc-link";
import { addEvent, createJob, createJobsFromInvoice, dueFor, setJobStatus } from "@/lib/jobs";
import { sendMessage } from "@/lib/messages";
import { notify } from "@/lib/notify";

const id = z.coerce.number().int().positive();
const optId = id.optional().or(z.literal("").transform(() => undefined));
const STAFF = ["admin", "manager"] as const;
const fields = (form: FormData) => Object.fromEntries(form);
const refresh = (jobId: number) => { revalidatePath(`/admin/jobs/${jobId}`); revalidatePath("/admin/jobs"); };

export async function newJob(form: FormData) {
  const user = await requireApp("erp", [...STAFF]);
  const parsed = z.object({ contactId: id, title: z.string().trim().min(2).max(200), serviceCode: z.string().max(40).optional(),
    requestId: optId, propertyId: optId, assignedTo: optId }).safeParse(fields(form));
  if (!parsed.success) redirect("/admin/jobs?error=1");
  const job = await createJob({ ...parsed.data, serviceCode: parsed.data.serviceCode || null, createdBy: user.id });
  await audit("job_created", "job", job.id, {}, user.id);
  await sendMessage({ key: `job_brief:${job.id}`, template: "job_brief", contactId: job.contactId, requestId: job.requestId,
    purpose: "transactional", vars: { number: job.number, service: job.title, link: jobLink(job.id) } }).catch(() => undefined);
  redirect(`/admin/jobs/${job.id}`);
}

export async function jobsFromInvoice(form: FormData) {
  const user = await requireApp("erp", [...STAFF]);
  const invoiceId = Number(form.get("invoiceId"));
  if (!Number.isInteger(invoiceId)) return;
  const created = await createJobsFromInvoice(invoiceId, user.id);
  await audit("jobs_created_from_invoice", "invoice", invoiceId, { jobs: created.length }, user.id);
  revalidatePath(`/admin/invoices/${invoiceId}`);
}

export async function updateJob(form: FormData) {
  const user = await requireApp("erp", [...STAFF]);
  const parsed = z.object({ id, assignedTo: optId, supplierId: optId,
    supplierCost: z.coerce.number().min(0).max(1_000_000).optional().or(z.literal("").transform(() => undefined)),
    notes: z.string().max(4000).default("") }).safeParse(fields(form));
  if (!parsed.success) return;
  const [before] = await db.select().from(serviceJobs).where(eq(serviceJobs.id, parsed.data.id));
  if (!before) return;
  const { id: jobId, ...v } = parsed.data;
  await db.update(serviceJobs).set({ assignedTo: v.assignedTo ?? null, supplierId: v.supplierId ?? null, supplierCost: v.supplierCost ?? null,
    notes: v.notes, updatedAt: new Date() }).where(eq(serviceJobs.id, jobId));
  if (v.assignedTo && v.assignedTo !== before.assignedTo && v.assignedTo !== user.id) {
    await notify({ userIds: [v.assignedTo] }, { kind: "job_assigned", title: `${before.number} · ${before.title}`, href: `/admin/jobs/${jobId}` });
  }
  await audit("job_updated", "job", jobId, { assignedTo: v.assignedTo, supplierId: v.supplierId }, user.id);
  refresh(jobId);
}

/** The shoot/visit date (Oman time) starts the delivery clock: due = date + the service's hours. */
export async function scheduleJob(form: FormData) {
  const user = await requireApp("erp", [...STAFF]);
  const parsed = z.object({ id, scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) }).safeParse(fields(form));
  if (!parsed.success) return;
  const [job] = await db.select().from(serviceJobs).where(eq(serviceJobs.id, parsed.data.id));
  if (!job) return;
  const scheduledAt = new Date(`${parsed.data.scheduledAt}:00+04:00`);
  await db.update(serviceJobs).set({ scheduledAt, dueAt: dueFor({ scheduledAt, slaHours: job.slaHours, createdAt: job.createdAt }),
    status: job.status === "new" ? "scheduled" : job.status, updatedAt: new Date() }).where(eq(serviceJobs.id, job.id));
  await addEvent(job.id, "status", `scheduled ${parsed.data.scheduledAt}`, user.id);
  refresh(job.id);
}

export async function moveJob(form: FormData) {
  const user = await requireApp("erp");
  const parsed = z.object({ id, status: z.enum(JOB_STATUSES) }).safeParse(fields(form));
  if (!parsed.success) return;
  await setJobStatus(parsed.data.id, parsed.data.status, user.id);
  await audit("job_status", "job", parsed.data.id, { status: parsed.data.status }, user.id);
  refresh(parsed.data.id);
}

export async function addDelivery(form: FormData) {
  const user = await requireApp("erp");
  const parsed = z.object({ id, label: z.string().trim().min(1).max(120), url: z.string().trim().url().max(1000)
    .refine((u) => u.startsWith("https://"), "https") }).safeParse(fields(form));
  if (!parsed.success) return;
  const [job] = await db.select().from(serviceJobs).where(eq(serviceJobs.id, parsed.data.id));
  if (!job) return;
  const deliverables = [...job.deliverables, { label: parsed.data.label, url: parsed.data.url, at: new Date().toISOString() }];
  await db.update(serviceJobs).set({ deliverables, updatedAt: new Date() }).where(eq(serviceJobs.id, job.id));
  await addEvent(job.id, "delivery", parsed.data.label, user.id);
  refresh(job.id);
}

/** Customer review: the SLA clock pauses; the customer approves or asks for changes from their link. */
export async function sendForReview(form: FormData) {
  const user = await requireApp("erp");
  const jobId = Number(form.get("id"));
  const job = await setJobStatus(jobId, "review", user.id);
  if (!job) return;
  await sendMessage({ key: `job_review:${job.id}:${job.deliverables.length}:${job.revisionsUsed}`, template: "job_review", contactId: job.contactId,
    requestId: job.requestId, purpose: "transactional", vars: { number: job.number, service: job.title, link: jobLink(job.id) } }).catch(() => undefined);
  await audit("job_sent_for_review", "job", job.id, {}, user.id);
  refresh(job.id);
}

export async function addJobNote(form: FormData) {
  const user = await requireApp("erp");
  const parsed = z.object({ id, body: z.string().trim().min(1).max(2000) }).safeParse(fields(form));
  if (!parsed.success) return;
  await addEvent(parsed.data.id, "note", parsed.data.body, user.id);
  refresh(parsed.data.id);
}

/** Supplier scorecard (strategy §10.2): a 1-5 rating and comment once the job is completed. */
export async function rateJob(form: FormData) {
  const user = await requireApp("erp", [...STAFF]);
  const parsed = z.object({ id, rating: z.coerce.number().int().min(1).max(5), ratingNote: z.string().max(500).default("") }).safeParse(fields(form));
  if (!parsed.success) return;
  await db.update(serviceJobs).set({ rating: parsed.data.rating, ratingNote: parsed.data.ratingNote }).where(eq(serviceJobs.id, parsed.data.id));
  await audit("supplier_rated", "job", parsed.data.id, { rating: parsed.data.rating }, user.id);
  refresh(parsed.data.id);
}
