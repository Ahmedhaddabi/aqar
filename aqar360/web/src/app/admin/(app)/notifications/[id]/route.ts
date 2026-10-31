import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { currentUser } from "@/lib/auth";

/** Opening a notification marks it read and goes to the record it is about. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me) return NextResponse.redirect(new URL("/admin/login", request.url));
  const id = Number((await params).id);
  const [n] = Number.isInteger(id) ? await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, me.id))).returning() : [];
  const target = n?.href?.startsWith("/admin") ? n.href : "/admin/notifications";
  return NextResponse.redirect(new URL(target, request.url));
}
