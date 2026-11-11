// Every admin page, signed in as a temporary admin on the TEST database: each must load (200) without a server error.
// Detail pages use demo records or temporary ones made here; everything made is removed at the end.
// Run with a local site that uses the test database: npm run test:pages -- http://localhost:3000
import "./test-guard.mts";

import { createHash, randomBytes } from "node:crypto";

import { asc, eq, inArray, isNull, like, sql } from "drizzle-orm";

import { db } from "@/db";
import { activities, agreements, applications, areas, auditLog, contacts, documents, employees, invoices, jobs, kbArticles, pages, payrollRuns, payslips, plots,
  projects, properties, requests, serviceJobs, sessions, users } from "@/db/schema";
import { createAgreement } from "@/lib/agreements";
import { createJob } from "@/lib/jobs";

const base = process.argv[2];
if (!base) { console.error("Give the local site address, e.g. http://localhost:3000"); process.exit(2); }
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const tag = `T${Date.now().toString(36)}`;
const first = async <T,>(rows: Promise<T[]>) => (await rows)[0] ?? null;

const [admin] = await db.insert(users).values({ name: `Page Admin ${tag}`, email: `pages-${tag}@test.invalid`, passwordHash: "x", role: "admin",
  apps: ["crm", "erp", "hr"] }).returning();
const token = randomBytes(32).toString("base64url");
await db.insert(sessions).values({ id: createHash("sha256").update(token).digest("hex"), userId: admin.id, expiresAt: new Date(Date.now() + 3_600_000) });
const made = { contacts: [] as number[], requests: [] as number[], invoices: [] as number[], jobs: [] as number[], agreements: [] as number[] };

try {
  const [c] = await db.insert(contacts).values({ name: `Pages Customer ${tag}`, phone: `+9689${Date.now().toString().slice(-7)}`, source: "Test" }).returning();
  made.contacts.push(c.id);
  const [r] = await db.insert(requests).values({ number: `TEST-${tag}`, kind: "search", subtype: "Rent", contactId: c.id, status: "working" }).returning();
  made.requests.push(r.id);
  const [inv] = await db.insert(invoices).values({ number: `TEST-${tag}-INV`, kind: "invoice", contactId: c.id, requestId: r.id, status: "draft",
    issueDate: new Date().toISOString().slice(0, 10), total: 10 }).returning();
  made.invoices.push(inv.id);
  const job = await createJob({ contactId: c.id, title: `Pages job ${tag}` });
  made.jobs.push(job.id);
  const ag = await createAgreement({ contactId: c.id, requestId: r.id, template: "marketing_open", userId: admin.id });
  made.agreements.push(ag!.id);
  // Stand-alone properties only: units inside a project are edited on the project page.
  const prop = await first(db.select().from(properties).where(isNull(properties.projectId)).orderBy(asc(properties.id)).limit(1));
  const project = await first(db.select().from(projects).limit(1));
  const area = await first(db.select().from(areas).limit(1));
  const kb = await first(db.select().from(kbArticles).limit(1));
  const page = await first(db.select().from(pages).limit(1));
  const employee = await first(db.select().from(employees).limit(1));
  const run = await first(db.select().from(payrollRuns).limit(1));
  const slip = await first(db.select().from(payslips).limit(1));
  const application = await first(db.select().from(applications).limit(1));
  const vacancy = await first(db.select().from(jobs).limit(1));
  if (prop) await db.insert(plots).values({ propertyId: prop.id, crs: "wgs84_utm40", points: [{ e: 641100, n: 2609300 }, { e: 641130, n: 2609300 }, { e: 641130, n: 2609340 }],
    polygon: [[58.38, 23.59], [58.3803, 23.59], [58.3803, 23.5904], [58.38, 23.59]], centerLat: 23.59, centerLng: 58.38, areaSqm: 600, public: false })
    .onConflictDoNothing();

  const paths: (string | null)[] = [
    "/admin", "/admin/apps", "/admin/account", "/admin/agreements", `/admin/agreements/${ag!.id}`, "/admin/approvals", "/admin/assistant", "/admin/calendar",
    "/admin/calendar?week=2026-11-08", "/admin/claims", "/admin/customers", `/admin/customers/${c.id}`, "/admin/erp", "/admin/expenses", "/admin/field",
    "/admin/finance", "/admin/hiring", application ? `/admin/hiring/${application.id}` : null, vacancy ? `/admin/hiring/jobs/${vacancy.id}` : null, "/admin/hr",
    employee ? `/admin/hr/employees/${employee.id}` : null, "/admin/hr/leave", "/admin/hr/payroll", run ? `/admin/hr/payroll/${run.id}` : null,
    slip ? `/admin/hr/payslips/${slip.id}` : null, "/admin/hr/renewals", "/admin/integrations", "/admin/invoices", `/admin/invoices/${inv.id}`,
    "/admin/invoices/new", "/admin/jobs", `/admin/jobs/${job.id}`, `/admin/jobs/new?contact=${c.id}`, "/admin/kb", kb ? `/admin/kb/${kb.id}` : null, "/admin/listings",
    "/admin/agents", "/admin/agents?tab=done", "/admin/agents/sources", "/admin/market", "/admin/messages", "/admin/messages?tab=log", "/admin/messages?tab=whatsapp", "/admin/notifications", "/admin/payment-methods", "/admin/invoice-design",
    "/admin/performance", "/admin/plots", project ? `/admin/projects/${project.id}` : null, prop ? `/admin/properties/${prop.id}` : null, "/admin/recurring",
    "/admin/reports", "/admin/reports/weekly", "/admin/requests", `/admin/requests/${r.id}`, "/admin/requests/new", "/admin/reviews", "/admin/reviews?tab=referrals",
    "/admin/search?q=test", "/admin/settings", "/admin/settings?tab=audit", "/admin/site", area ? `/admin/site/areas/${area.id}` : null,
    page ? `/admin/site/pages/${page.id}` : null, "/admin/users", "/admin/whatsapp", `/admin/whatsapp/${c.id}`,
  ];
  const skipped = paths.filter((p) => p === null).length;
  for (const path of paths.filter((p): p is string => !!p)) {
    const res = await fetch(base + path, { headers: { cookie: `aqar_admin_session=${token}` }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    const broken = /Application error|Internal Server Error|__next_error__/.test(html);
    check(`${path} loads`, res.status === 200 && !broken, `status ${res.status}${res.headers.get("location") ? ` → ${res.headers.get("location")}` : ""}${broken ? " (error page)" : ""}`);
  }
  if (skipped) console.log(`      ${skipped} detail pages skipped: no record of that kind in the test database (hiring, HR, payroll)`);
  const ics = await fetch(`${base}/api/calendar/${"x".repeat(30)}.ics`);
  check("unknown calendar link is refused", ics.status === 404);
} finally {
  if (made.agreements.length) await db.delete(agreements).where(inArray(agreements.id, made.agreements));
  if (made.jobs.length) {
    await db.execute(sql`delete from job_events where job_id in (${sql.join(made.jobs.map((j) => sql`${j}`), sql`, `)})`);
    await db.delete(serviceJobs).where(inArray(serviceJobs.id, made.jobs));
  }
  if (made.invoices.length) await db.delete(invoices).where(inArray(invoices.id, made.invoices));
  if (made.requests.length) await db.delete(requests).where(inArray(requests.id, made.requests));
  await db.delete(documents).where(inArray(documents.ownerId, made.contacts));
  if (made.contacts.length) {
    await db.delete(activities).where(inArray(activities.contactId, made.contacts));
    await db.delete(contacts).where(inArray(contacts.id, made.contacts));
  }
  // The activity log keeps who did what; remove the test admin's lines first (sessions and notifications go with the user).
  const testAdmins = (await db.select({ id: users.id }).from(users).where(like(users.email, "pages-%@test.invalid"))).map((u) => u.id);
  if (testAdmins.length) {
    await db.delete(auditLog).where(inArray(auditLog.userId, testAdmins));
    await db.delete(agreements).where(inArray(agreements.createdBy, testAdmins));
    await db.delete(users).where(inArray(users.id, testAdmins));
  }
}
const left = await db.select({ id: users.id }).from(users).where(like(users.email, `%${tag}%`));
check("temporary admin and records removed", left.length === 0);
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
