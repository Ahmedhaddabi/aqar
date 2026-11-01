// Service jobs: one job per service sold. SLA follows strategy §8.3 (delivery hours after the shoot; the clock
// stops while waiting on the customer); statuses follow the unified workflow (§26.1).
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { contacts, invoices, jobEvents, type JobStatus, serviceJobs, services } from "@/db/schema";

import { jobLink } from "./doc-link";
import { sendMessage } from "./messages";
import { notify } from "./notify";
import { askForReview } from "./reviews";

export const OPEN_JOB = ["new", "scheduled", "in_progress", "waiting_client", "review"] as const;
const SCHEDULE_CONFIRM_HOURS = 4; // "confirm the shoot date within 4 working hours"

/** Due time: without a shoot date the team must confirm one quickly; after the shoot, the service's delivery hours. */
export function dueFor(job: { scheduledAt: Date | null; slaHours: number; createdAt: Date }) {
  return job.scheduledAt ? new Date(job.scheduledAt.getTime() + job.slaHours * 3_600_000)
    : new Date(job.createdAt.getTime() + SCHEDULE_CONFIRM_HOURS * 3_600_000);
}

export type Sla = "green" | "amber" | "red" | "paused" | "done";
/** Green / amber (less than a quarter of the time left) / red (late); paused while waiting on the customer. */
export function slaOf(job: { status: JobStatus; dueAt: Date | null; scheduledAt: Date | null; slaHours: number }, now = Date.now()): Sla {
  if (job.status === "completed" || job.status === "cancelled") return "done";
  if (job.status === "waiting_client" || job.status === "review") return "paused";
  if (!job.dueAt) return "green";
  const left = job.dueAt.getTime() - now;
  if (left < 0) return "red";
  const window = (job.scheduledAt ? job.slaHours : SCHEDULE_CONFIRM_HOURS) * 3_600_000;
  return left < window / 4 ? "amber" : "green";
}

export async function addEvent(jobId: number, kind: (typeof jobEvents.$inferInsert)["kind"], body = "", userId: number | null = null) {
  await db.insert(jobEvents).values({ jobId, kind, body, userId });
}

/**
 * Status change with the SLA pause rule: entering "waiting on customer" or "customer review" stops the clock;
 * leaving it moves the due time forward by the time spent waiting.
 */
export async function setJobStatus(jobId: number, status: JobStatus, userId: number | null) {
  const [job] = await db.select().from(serviceJobs).where(eq(serviceJobs.id, jobId));
  if (!job || job.status === status) return job ?? null;
  const pausing = status === "waiting_client" || status === "review";
  const now = new Date();
  let { dueAt, pausedAt } = job;
  if (pausing && !pausedAt) pausedAt = now;
  if (!pausing && pausedAt) {
    if (dueAt) dueAt = new Date(dueAt.getTime() + (now.getTime() - pausedAt.getTime()));
    pausedAt = null;
  }
  const [updated] = await db.update(serviceJobs).set({ status, dueAt, pausedAt, updatedAt: now,
    completedAt: status === "completed" ? now : null }).where(eq(serviceJobs.id, jobId)).returning();
  await addEvent(jobId, "status", status, userId);
  if (status === "completed") await askForReview(job.contactId, `job:${jobId}`, job.requestId);
  return updated;
}

const number = sql`'JOB-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('job_number_seq')::text, 5, '0')`;

export async function createJob(values: { contactId: number; title: string; serviceCode?: string | null; requestId?: number | null;
  invoiceId?: number | null; propertyId?: number | null; assignedTo?: number | null; createdBy?: number | null; price?: number | null }) {
  const [service] = values.serviceCode ? await db.select().from(services).where(eq(services.code, values.serviceCode)) : [];
  const now = new Date();
  const slaHours = service?.slaHours ?? 48;
  const [job] = await db.insert(serviceJobs).values({ ...values, number, slaHours, revisionsAllowed: service?.revisions ?? 2,
    dueAt: dueFor({ scheduledAt: null, slaHours, createdAt: now }) }).returning();
  await addEvent(job.id, "system", "created", values.createdBy ?? null);
  await notify({ app: "erp" }, { kind: "job_new", title: `${job.number} · ${job.title}`, href: `/admin/jobs/${job.id}`, key: `job_new:${job.id}` });
  if (values.assignedTo) await notify({ userIds: [values.assignedTo] }, { kind: "job_assigned", title: `${job.number} · ${job.title}`, href: `/admin/jobs/${job.id}` });
  return job;
}

/**
 * After payment (strategy §6: "scheduling starts after the order is complete and paid"): one job per service line,
 * then the customer is asked for the job details through their secure link. Runs once per invoice.
 */
export async function createJobsFromInvoice(invoiceId: number, userId: number | null = null) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv || inv.kind !== "invoice") return [];
  const existing = await db.select({ id: serviceJobs.id }).from(serviceJobs).where(eq(serviceJobs.invoiceId, invoiceId));
  if (existing.length) return [];
  const lines = inv.lines.filter((l) => !l.passThrough && l.serviceCode && l.serviceCode !== "AQ-EXTRA-REVISION");
  const created = [];
  for (const line of lines) {
    for (let i = 0; i < Math.max(1, Math.min(10, Math.round(line.qty))); i++) {
      created.push(await createJob({ contactId: inv.contactId, title: line.description, serviceCode: line.serviceCode, requestId: inv.requestId,
        invoiceId, createdBy: userId, price: line.unitPrice }));
    }
  }
  for (const job of created) {
    await sendMessage({ key: `job_brief:${job.id}`, template: "job_brief", contactId: job.contactId, requestId: job.requestId,
      purpose: "transactional", vars: { number: job.number, service: job.title, link: jobLink(job.id) } }).catch(() => undefined);
  }
  return created;
}

export async function jobsForInvoice(invoiceId: number) {
  return db.select().from(serviceJobs).where(eq(serviceJobs.invoiceId, invoiceId));
}

export async function openJobsFor(contactId: number) {
  return db.select().from(serviceJobs).where(and(eq(serviceJobs.contactId, contactId), inArray(serviceJobs.status, [...OPEN_JOB])));
}

export async function jobWithContact(jobId: number) {
  const [row] = await db.select({ job: serviceJobs, contact: contacts }).from(serviceJobs)
    .innerJoin(contacts, eq(serviceJobs.contactId, contacts.id)).where(eq(serviceJobs.id, jobId));
  return row ?? null;
}

/** Late jobs: the responsible person and the managers are told once a day (escalation). */
export async function notifyLateJobs(now = new Date()) {
  const open = await db.select().from(serviceJobs).where(inArray(serviceJobs.status, [...OPEN_JOB]));
  const late = open.filter((j) => slaOf(j, now.getTime()) === "red");
  const day = now.toISOString().slice(0, 10);
  for (const j of late) {
    await notify({ userIds: [j.assignedTo], app: "erp", roles: ["admin", "manager"] }, { kind: "job_late", title: `${j.number} · ${j.title}`,
      href: `/admin/jobs/${j.id}`, key: `job_late:${j.id}:${day}` });
  }
  return late.length;
}

/** First replies past the target: managers hear about each one once (strategy §8.3 escalation). */
export async function notifyLateReplies(now = new Date()) {
  const { requests, settings } = await import("@/db/schema");
  const [setting] = await db.select().from(settings).where(eq(settings.key, "firstResponseHours"));
  const hours = Number(setting?.value) || 2;
  const late = await db.select().from(requests).where(and(eq(requests.status, "new"),
    sql`${requests.firstResponseAt} is null and ${requests.createdAt} < ${new Date(now.getTime() - hours * 3_600_000)}`));
  for (const r of late) {
    await notify({ userIds: [r.assignedTo], app: "crm", roles: ["admin", "manager"] }, { kind: "request_late", title: r.number,
      href: `/admin/requests/${r.id}`, key: `request_late:${r.id}` });
  }
  return late.length;
}
