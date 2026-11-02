"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { contacts, serviceJobs } from "@/db/schema";
import { audit } from "@/lib/auth";
import { currentCustomer, linkAccount } from "@/lib/customer-auth";
import { jobLink, portalLink, validJobLink, validPortalLink } from "@/lib/doc-link";
import { addEvent, setJobStatus } from "@/lib/jobs";
import { sendMessage } from "@/lib/messages";
import { notify } from "@/lib/notify";
import { bookOnline, cancelOnline, toggleSaved } from "@/lib/viewings";

/** Same answer whether or not the email is known (no account discovery); at most one email per hour per customer. */
export async function requestPortalLink(form: FormData) {
  const email = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (email.success) {
    const [c] = await db.select().from(contacts).where(eq(contacts.email, email.data)).limit(1);
    if (c) {
      const hour = new Date().toISOString().slice(0, 13);
      await sendMessage({ key: `portal:${c.id}:${hour}`, template: "portal_link", contactId: c.id, purpose: "transactional",
        vars: { link: portalLink(c.id) } }).catch(() => undefined);
      await audit("portal_link_requested", "contact", c.id, { ip: (await headers()).get("x-forwarded-for")?.split(",")[0] ?? null });
    }
  }
  redirect("/portal?sent=1");
}

async function jobFor(form: FormData) {
  const id = Number(form.get("id"));
  const s = String(form.get("s") ?? "");
  if (!Number.isInteger(id) || !validJobLink(id, s)) return null;
  const [job] = await db.select().from(serviceJobs).where(eq(serviceJobs.id, id));
  return job ?? null;
}

const back = (id: number, state: string) => redirect(`${jobLink(id).replace(/^https?:\/\/[^/]+/, "")}&done=${state}`);

/** The secure form after payment (strategy §26.3): address, times, site contact, notes. */
export async function submitBrief(form: FormData) {
  const job = await jobFor(form);
  if (!job || ["completed", "cancelled"].includes(job.status)) return;
  const text = (k: string, max = 300) => String(form.get(k) ?? "").trim().slice(0, max);
  const brief = { address: text("address"), mapLink: text("mapLink", 500), preferredTimes: text("preferredTimes"), siteContact: text("siteContact"),
    sitePhone: text("sitePhone", 30), notes: text("notes", 2000) };
  if (!brief.address && !brief.mapLink) return back(job.id, "missing");
  await db.update(serviceJobs).set({ brief, briefAt: new Date(), updatedAt: new Date() }).where(eq(serviceJobs.id, job.id));
  await addEvent(job.id, "brief");
  if (job.status === "waiting_client") await setJobStatus(job.id, "in_progress", null);
  await notify({ userIds: [job.assignedTo], app: "erp", roles: ["admin", "manager"] }, { kind: "job_brief", title: `${job.number} · ${job.title}`,
    href: `/admin/jobs/${job.id}` });
  back(job.id, "brief");
}

/** Customer approval of the delivery (strategy §26.4): saved with date and time; the job is completed. */
export async function approveJob(form: FormData) {
  const job = await jobFor(form);
  if (!job || job.status !== "review") return;
  await db.update(serviceJobs).set({ approvedAt: new Date() }).where(eq(serviceJobs.id, job.id));
  await addEvent(job.id, "approved");
  await setJobStatus(job.id, "completed", null);
  await notify({ userIds: [job.assignedTo], app: "erp", roles: ["admin", "manager"] }, { kind: "job_approved", title: `${job.number} · ${job.title}`,
    href: `/admin/jobs/${job.id}` });
  back(job.id, "approved");
}

/** Each change request is a revision round; rounds beyond those included are flagged for the team (chargeable). */
export async function requestChanges(form: FormData) {
  const job = await jobFor(form);
  const reason = String(form.get("reason") ?? "").trim().slice(0, 2000);
  if (!job || job.status !== "review" || !reason) return;
  const used = job.revisionsUsed + 1;
  await db.update(serviceJobs).set({ revisionsUsed: used }).where(eq(serviceJobs.id, job.id));
  await addEvent(job.id, "changes", used > job.revisionsAllowed ? `${reason}\n[extra revision ${used}/${job.revisionsAllowed}]` : reason);
  await setJobStatus(job.id, "in_progress", null);
  await notify({ userIds: [job.assignedTo], app: "erp", roles: ["admin", "manager"] }, { kind: "job_changes", title: `${job.number} · ${job.title}`,
    href: `/admin/jobs/${job.id}` });
  back(job.id, "changes");
}

// ---- Viewings and saved properties: every form carries the signed portal link (c, e, s) ----------------------------
function portalFrom(form: FormData) {
  const p = { c: Number(form.get("c")), e: Number(form.get("e")), s: String(form.get("s") ?? "") };
  if (!validPortalLink(p.c, p.e, p.s)) redirect("/portal?expired=1");
  return p;
}
const portalQuery = (p: { c: number; e: number; s: string }) => `c=${p.c}&e=${p.e}&s=${encodeURIComponent(p.s)}`;
/** Back to where the customer came from: "My account" when signed in to this record, otherwise the private link. */
async function home(p: { c: number; e: number; s: string }, done: string, hash: string) {
  const account = await currentCustomer();
  return account?.contactId === p.c ? `/${account.language}/account?done=${done}${hash}` : `/portal/home?${portalQuery(p)}&done=${done}${hash}`;
}

export async function bookViewingForm(form: FormData) {
  const p = portalFrom(form);
  const match = Number(form.get("match"));
  const replace = Number(form.get("replace")) || undefined;
  const result = await bookOnline(p.c, match, String(form.get("slot") ?? ""), replace);
  if (!result.ok) redirect(`/portal/book?${portalQuery(p)}&m=${match}${replace ? `&replace=${replace}` : ""}&error=${result.reason}`);
  redirect(await home(p, "booked", "#viewings"));
}

export async function cancelViewingForm(form: FormData) {
  const p = portalFrom(form);
  const done = await cancelOnline(p.c, Number(form.get("id")));
  redirect(await home(p, done ? "cancelled" : "none", "#viewings"));
}

export async function toggleSavedForm(form: FormData) {
  const p = portalFrom(form);
  const saved = await toggleSaved(p.c, Number(form.get("match")));
  redirect(await home(p, saved === null ? "none" : saved ? "saved" : "unsaved", "#suggestions"));
}

/** A signed-in customer opened a private link we sent them: that proves the record is theirs, so it joins the account. */
export async function linkFromPortalForm(form: FormData) {
  const p = portalFrom(form);
  const account = await currentCustomer();
  if (!account) redirect("/ar/account/login");
  const ok = await linkAccount(account.id, p.c, "private_link");
  redirect(ok ? `/${account.language}/account?done=linked` : `/portal/home?${portalQuery(p)}&linked=0`);
}
