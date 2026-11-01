import { NextResponse, type NextRequest } from "next/server";

import { inOman, nearbyPlaces } from "@/lib/nearby";

/** Places around a point on the public map (cached per grid cell; points inside Oman only). */
export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inOman(lat, lng)) {
    return NextResponse.json({ ok: false, error: { code: "invalid_request", message: "A point in Oman is required." } }, { status: 400 });
  }
  const places = await nearbyPlaces(lat, lng);
  if (!places) return NextResponse.json({ ok: true, data: { places: [], unavailable: true } }, { headers: { "Cache-Control": "no-store" } });
  // The same cell answers for everyone: let browsers and the CDN keep it for a day.
  return NextResponse.json({ ok: true, data: { places } }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
