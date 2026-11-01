import { and, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { properties, propertyViews } from "@/db/schema";
import { readJson, reject, sameOrigin } from "@/lib/request";
import { muscatDay } from "@/lib/viewings";

/** The map counts a listing view (once per visitor session, see PropertyMap) for the owner's dashboard. Public listings only. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject(403, "not_permitted", "Cross-site requests are not allowed.");
  const body = await readJson(request, 1_000);
  const code = typeof body?.code === "string" ? body.code.slice(0, 40) : "";
  if (!code) return reject(400, "invalid_request", "Invalid request body.");
  try {
    const [p] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.code, code), eq(properties.public, true), eq(properties.verified, true)));
    if (p) {
      await db.insert(propertyViews).values({ propertyId: p.id, day: muscatDay(new Date()), count: 1 })
        .onConflictDoUpdate({ target: [propertyViews.propertyId, propertyViews.day], set: { count: sql`${propertyViews.count} + 1` } });
    }
  } catch (error) {
    console.error("view count failed:", (error as Error).message);
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
