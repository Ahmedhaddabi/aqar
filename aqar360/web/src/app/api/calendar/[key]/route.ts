import { NextResponse } from "next/server";

import { calendarFor } from "@/lib/ics";

/** Private calendar feed for one staff member (the key is the secret; revoked by making a new link). */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = (await params).key.replace(/\.ics$/, "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(key)) return new NextResponse("Not found", { status: 404 });
  const body = await calendarFor(key);
  if (!body) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900",
    "Content-Disposition": 'inline; filename="aqar360.ics"', "X-Robots-Tag": "noindex" } });
}
