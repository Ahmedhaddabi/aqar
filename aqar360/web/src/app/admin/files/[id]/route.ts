import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { canSeeRequest } from "@/admin/crm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { audit, canOpen, currentUser } from "@/lib/auth";

/** Opens a vault document after checking who is asking; every open is written to the activity log (strategy §26.3). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/admin/login", request.url));
  const id = Number((await params).id);
  const [doc] = Number.isInteger(id) ? await db.select().from(documents).where(eq(documents.id, id)) : [];
  if (!doc) return new NextResponse("Not found", { status: 404 });
  const allowed = doc.ownerType === "employee" ? canOpen(user, "hr") && user.role !== "agent"
    : doc.ownerType === "request" && user.role === "agent" ? await canSeeRequest(user, doc.ownerId)
    : doc.ownerType === "job" ? canOpen(user, "erp") || canOpen(user, "crm")
    : canOpen(user, "crm") || canOpen(user, "erp");
  if (!allowed) return new NextResponse("Not allowed", { status: 403 });
  await audit("document_opened", doc.ownerType, doc.ownerId, { document: doc.id }, user.id);
  return NextResponse.redirect(new URL(doc.url, request.url));
}
