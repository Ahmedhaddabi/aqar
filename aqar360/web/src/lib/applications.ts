// Job applications and supplier sign-ups from the website: validated, rate limited, file stored, reviewed in /admin/hiring.
import { and, count, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { applications, auditLog, jobs } from "@/db/schema";

import { normalizePhone, sha256, verifyCaptcha } from "./intake";
import { notify } from "./notify";
import { uploadImage } from "./storage";

const RATE_LIMIT = 5;
const MAX_FILE = 4 * 1024 * 1024;
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

const schema = z.object({
  kind: z.enum(["job", "supplier"]),
  language: z.enum(["ar", "en"]).default("ar"),
  job_id: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().transform((v, ctx) => normalizePhone(v) ?? (ctx.addIssue({ code: "custom", message: "phone" }), z.NEVER)),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(160)]).optional().transform((v) => v || undefined),
  company: text(160), cr_number: text(40), services: text(500), areas: text(300), experience: text(40), message: text(2000),
  privacy: z.literal("on"),
  idempotency_key: z.string().min(8).max(80),
  website: z.string().max(0).optional(), // honeypot: people never see this field
});

export type ApplyError = { status: number; code: string; fields?: Record<string, string> };

export async function submitApplication(form: FormData, ip?: string): Promise<{ ok: true } | { ok: false; error: ApplyError }> {
  const raw = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message === "phone" ? "phone" : "invalid";
    return { ok: false, error: { status: 400, code: "validation_error", fields } };
  }
  const data = parsed.data;
  const [existing] = await db.select({ id: applications.id }).from(applications).where(eq(applications.idempotencyKey, data.idempotency_key));
  if (existing) return { ok: true };

  const ipHash = ip ? sha256(`aqar:${ip}`) : null;
  if (ipHash) {
    const [recent] = await db.select({ n: count() }).from(auditLog).where(and(eq(auditLog.action, "application_received"),
      gt(auditLog.at, new Date(Date.now() - 3_600_000)), sql`${auditLog.data}->>'ip' = ${ipHash}`));
    if (recent.n >= RATE_LIMIT) return { ok: false, error: { status: 429, code: "rate_limited" } };
  }
  const captcha = form.get("cf-turnstile-response");
  if (!(await verifyCaptcha(typeof captcha === "string" ? captcha : undefined, ip))) {
    return { ok: false, error: { status: 400, code: "captcha_failed" } };
  }

  let jobId: number | null = null;
  if (data.kind === "job" && data.job_id) {
    const [job] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, data.job_id), eq(jobs.published, true)));
    jobId = job?.id ?? null;
  }
  let fileUrl: string | null = null;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE) return { ok: false, error: { status: 400, code: "validation_error", fields: { file: "too_big" } } };
    const stored = await uploadImage(file, "cvs");
    if (!stored.ok) return { ok: false, error: { status: stored.error === "invalid" ? 400 : 503, code: "validation_error", fields: { file: stored.error } } };
    fileUrl = stored.url;
  }

  const details = Object.fromEntries((["company", "cr_number", "services", "areas", "experience", "message"] as const)
    .filter((k) => data[k]).map((k) => [k, data[k]!]));
  const [row] = await db.insert(applications).values({ kind: data.kind, jobId, name: data.full_name, phone: data.phone,
    email: data.email ?? null, details: { ...details, language: data.language, privacy_accepted_at: new Date().toISOString() },
    fileUrl, idempotencyKey: data.idempotency_key }).returning({ id: applications.id });
  await db.insert(auditLog).values({ action: "application_received", entity: "application", entityId: String(row.id),
    data: { kind: data.kind, ...(ipHash ? { ip: ipHash } : {}) } });
  await notify({ app: "hr", roles: ["admin", "manager"] }, { kind: "application_new", title: data.full_name, href: `/admin/hiring/${row.id}`,
    key: `application_new:${row.id}` });
  return { ok: true };
}
