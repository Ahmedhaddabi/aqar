import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { properties } from "@/db/schema";
import { currentUser } from "@/lib/auth";

/**
 * The property's cover photo from our own address, so the listing card can be drawn on a canvas in the browser
 * (a photo from another domain would block the download). Only the stored cover is ever fetched.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const [p] = await db.select({ cover: properties.coverImage }).from(properties).where(eq(properties.id, Number((await params).id)));
  if (!p?.cover) return new NextResponse(null, { status: 404 });
  try {
    // Local development photos are already on our own address.
    if (p.cover.startsWith("/uploads/")) return NextResponse.redirect(new URL(p.cover, request.url));
    if (!/^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i.test(p.cover)) return new NextResponse(null, { status: 404 });
    const res = await fetch(p.cover, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return new NextResponse(null, { status: 404 });
    return new NextResponse(res.body, { headers: { "Content-Type": res.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "private, max-age=300" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
