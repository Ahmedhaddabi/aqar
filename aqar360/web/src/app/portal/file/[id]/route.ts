import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { documents, requests, serviceJobs } from "@/db/schema";
import { audit } from "@/lib/auth";
import { validPortalLink } from "@/lib/doc-link";

/** A shared vault file, opened from the customer's portal: only files marked "customer can see it" and belonging to them. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const q = request.nextUrl.searchParams;
  const contactId = Number(q.get("c"));
  if (!validPortalLink(contactId, Number(q.get("e")), q.get("s") ?? undefined)) return new NextResponse("Link expired", { status: 403 });
  const [doc] = await db.select().from(documents).where(eq(documents.id, Number((await params).id) || 0));
  if (!doc?.shared) return new NextResponse("Not found", { status: 404 });
  const owner = doc.ownerType === "contact" ? doc.ownerId
    : doc.ownerType === "job" ? (await db.select({ c: serviceJobs.contactId }).from(serviceJobs).where(eq(serviceJobs.id, doc.ownerId)))[0]?.c
    : doc.ownerType === "request" ? (await db.select({ c: requests.contactId }).from(requests).where(eq(requests.id, doc.ownerId)))[0]?.c : null;
  if (owner !== contactId) return new NextResponse("Not found", { status: 404 });
  await audit("document_opened_by_customer", doc.ownerType, doc.ownerId, { document: doc.id, contact: contactId });
  return NextResponse.redirect(new URL(doc.url, request.url));
}
