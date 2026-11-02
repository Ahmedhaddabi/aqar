// Private customer links: nothing stored, AUTH_SECRET signs "<kind>:<id>" (and an expiry for the portal).
// Rotating AUTH_SECRET invalidates every link.
import { createHmac, timingSafeEqual } from "node:crypto";

import { siteUrl } from "./config";

type Kind = "invoice" | "receipt" | "job" | "portal" | "review" | "agreement";
const sign = (kind: Kind, value: string) =>
  createHmac("sha256", process.env.AUTH_SECRET!).update(`${kind}:${value}`).digest("base64url").slice(0, 32);

function valid(kind: Kind, value: string, signature: string | undefined | null) {
  if (!process.env.AUTH_SECRET || !signature) return false;
  const expected = Buffer.from(sign(kind, value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const link = (path: string, kind: Kind, value: string) => (process.env.AUTH_SECRET ? `${siteUrl}${path}s=${sign(kind, value)}` : siteUrl);

/** Quote or invoice (also the page with the pay buttons). */
export const docLink = (id: number) => link(`/doc/${id}?`, "invoice", String(id));
export const validDocLink = (id: number, signature: string | undefined) => valid("invoice", String(id), signature);

export const receiptLink = (paymentId: number) => link(`/doc/receipt/${paymentId}?`, "receipt", String(paymentId));
export const validReceiptLink = (paymentId: number, signature: string | undefined) => valid("receipt", String(paymentId), signature);

/** A service job: the customer sends details, sees deliveries, approves or asks for changes. */
export const jobLink = (jobId: number) => link(`/portal/job/${jobId}?`, "job", String(jobId));
export const validJobLink = (jobId: number, signature: string | undefined) => valid("job", String(jobId), signature);

/** The customer's portal: all their requests, invoices, receipts and jobs. Valid for 30 days. */
export function portalLink(contactId: number, days = 30) {
  const exp = Math.floor(Date.now() / 1000) + days * 86_400;
  return link(`/portal/home?c=${contactId}&e=${exp}&`, "portal", `${contactId}.${exp}`);
}
/** The same signed values for forms on the signed-in "My account" page (short-lived: the session is the real check). */
export function portalParams(contactId: number, hours = 12) {
  const e = Math.floor(Date.now() / 1000) + hours * 3_600;
  return { c: contactId, e, s: process.env.AUTH_SECRET ? sign("portal", `${contactId}.${e}`) : "" };
}
export function validPortalLink(contactId: number, exp: number, signature: string | undefined) {
  return Number.isInteger(contactId) && exp * 1000 > Date.now() && valid("portal", `${contactId}.${exp}`, signature);
}

/** One review per customer and deal or job (`ref` = request:<id> or job:<id>). */
export const reviewLink = (contactId: number, ref: string) =>
  link(`/portal/review?c=${contactId}&r=${encodeURIComponent(ref)}&`, "review", `${contactId}.${ref}`);
export const validReviewLink = (contactId: number, ref: string, signature: string | undefined) =>
  Number.isInteger(contactId) && valid("review", `${contactId}.${ref}`, signature);

/** An agreement to read and sign online. */
export const agreementLink = (id: number) => link(`/doc/agreement/${id}?`, "agreement", String(id));
export const validAgreementLink = (id: number, signature: string | undefined) => valid("agreement", String(id), signature);
