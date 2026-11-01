// Reviews after a won deal or a completed job, and "invite a friend" referral links. A review appears on the website
// only when the customer allowed it and staff approved it (first name only). Referral links use the website's own
// attribution (utm_campaign=ref-CODE), so a referred request records who sent it.
import { randomBytes } from "node:crypto";

import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { contacts, requests, reviews } from "@/db/schema";

import { siteUrl } from "./config";
import { reviewLink } from "./doc-link";
import { sendMessage } from "./messages";
import { notify } from "./notify";

/** Asks once per deal or job; skipped silently when the customer cannot be reached (recorded in the outbox). */
export async function askForReview(contactId: number, ref: string, requestId: number | null = null) {
  const [done] = await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.contactId, contactId), eq(reviews.ref, ref)));
  if (done) return;
  await sendMessage({ key: `review:${contactId}:${ref}`, template: "review_request", contactId, requestId, purpose: "transactional",
    vars: { link: reviewLink(contactId, ref) } }).catch((e) => console.error("review request failed:", (e as Error).message));
}

export async function saveReview(contactId: number, ref: string, input: { rating: number; comment: string; publish: boolean }) {
  const rating = Math.min(5, Math.max(1, Math.round(input.rating)));
  const [row] = await db.insert(reviews).values({ contactId, ref, rating, comment: input.comment.trim().slice(0, 2000), publish: input.publish })
    .onConflictDoNothing().returning();
  if (row) {
    await notify({ app: "crm", roles: ["admin", "manager"] }, { kind: "review_new", title: `${"★".repeat(rating)}${"☆".repeat(5 - rating)} ${input.comment.slice(0, 80)}`,
      href: "/admin/reviews", key: `review_new:${row.id}` });
  }
  return row ?? null;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I: easy to read aloud

/** The customer's own invite code, made the first time it is needed. */
export async function referralCode(contactId: number) {
  const [c] = await db.select({ code: contacts.referralCode }).from(contacts).where(eq(contacts.id, contactId));
  if (c?.code) return c.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = [...randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
    const [row] = await db.update(contacts).set({ referralCode: code }).where(and(eq(contacts.id, contactId), sql`${contacts.referralCode} is null`))
      .returning({ code: contacts.referralCode }).catch(() => [] as { code: string | null }[]);
    if (row?.code) return row.code;
    const [again] = await db.select({ code: contacts.referralCode }).from(contacts).where(eq(contacts.id, contactId));
    if (again?.code) return again.code;
  }
  throw new Error("could not create a referral code");
}

export const referralUrl = (code: string) => `${siteUrl}/r/${code}`;

/** A request that arrived through someone's invite link: remember who sent it (never the customer themselves). */
export async function creditReferral(requestId: number, attribution: Record<string, string>) {
  const code = attribution.utm_campaign?.startsWith("ref-") ? attribution.utm_campaign.slice(4).toUpperCase() : "";
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return null;
  const [referrer] = await db.select().from(contacts).where(eq(contacts.referralCode, code));
  const [r] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!referrer || !r || referrer.id === r.contactId) return null;
  await db.update(requests).set({ referredBy: referrer.id }).where(eq(requests.id, requestId));
  return referrer;
}

export async function referralStats(contactId: number) {
  const rows = await db.select({ status: requests.status, n: count() }).from(requests).where(eq(requests.referredBy, contactId)).groupBy(requests.status);
  return { total: rows.reduce((a, r) => a + r.n, 0), won: rows.find((r) => r.status === "won")?.n ?? 0 };
}

/** Reviews to show on the website: allowed by the customer, approved by staff, first name only. */
export async function publicReviews(limit = 6) {
  const rows = await db.select({ r: reviews, name: contacts.name }).from(reviews).innerJoin(contacts, eq(reviews.contactId, contacts.id))
    .where(and(eq(reviews.publish, true), eq(reviews.approved, true))).orderBy(desc(reviews.rating), desc(reviews.createdAt)).limit(limit);
  return rows.map(({ r, name }) => ({ id: r.id, rating: r.rating, comment: r.comment, name: name.trim().split(/\s+/)[0] ?? "" }));
}

export async function referrers() {
  return db.select({ id: contacts.id, name: contacts.name, code: contacts.referralCode, total: count(requests.id),
    won: sql<number>`count(*) filter (where ${requests.status} = 'won')`.mapWith(Number) })
    .from(requests).innerJoin(contacts, eq(requests.referredBy, contacts.id)).where(isNotNull(requests.referredBy))
    .groupBy(contacts.id).orderBy(desc(count(requests.id)));
}
