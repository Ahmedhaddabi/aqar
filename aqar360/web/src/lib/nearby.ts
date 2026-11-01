// Places around a listing (schools, hospitals, shops, mosques, beaches, parks) from OpenStreetMap via the public Overpass
// API. Results are cached for 30 days per ~1 km grid cell, so the free service is asked about each cell rarely, and only
// points inside Oman are accepted. Data © OpenStreetMap contributors (ODbL), credited where it is shown.
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { nearbyCache } from "@/db/schema";

export const NEARBY_CATEGORIES = ["school", "health", "pharmacy", "shop", "mosque", "park", "beach"] as const;
export type NearbyCategory = (typeof NEARBY_CATEGORIES)[number];
export type NearbyPlace = { cat: NearbyCategory; name: string | null; nameAr: string | null; lat: number; lng: number };

// Public Overpass servers, tried in order: each is free and sometimes busy.
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const TTL_DAYS = 30;

export const inOman = (lat: number, lng: number) => lat >= 16.4 && lat <= 26.6 && lng >= 51.8 && lng <= 60.0;
export const cellOf = (lat: number, lng: number) => ({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 });

function categoryOf(tags: Record<string, string>): NearbyCategory | null {
  if (/^(school|college|university|kindergarten)$/.test(tags.amenity ?? "")) return "school";
  if (/^(hospital|clinic|doctors)$/.test(tags.amenity ?? "")) return "health";
  if (tags.amenity === "pharmacy") return "pharmacy";
  if (tags.amenity === "place_of_worship") return "mosque";
  if (/^(supermarket|mall|department_store)$/.test(tags.shop ?? "")) return "shop";
  if (tags.natural === "beach") return "beach";
  if (tags.leisure === "park") return "park";
  return null;
}

/** Turns an Overpass JSON answer into places (exported for the tests). */
export function parseOverpass(json: { elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] }) {
  const out: NearbyPlace[] = [];
  for (const el of json.elements ?? []) {
    const tags = el.tags ?? {};
    const cat = categoryOf(tags);
    const p = el.center ?? (el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : null);
    if (!cat || !p) continue;
    out.push({ cat, name: tags["name:en"] ?? tags.name ?? null, nameAr: tags["name:ar"] ?? (/[\u0600-\u06FF]/.test(tags.name ?? "") ? tags.name : null) ?? null,
      lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lon * 1e6) / 1e6 });
  }
  return out;
}

async function fetchOverpass(lat: number, lng: number): Promise<NearbyPlace[]> {
  const at = (r: number) => `(around:${r},${lat},${lng})`;
  const query = `[out:json][timeout:25];(
nwr["amenity"~"^(school|college|university|kindergarten)$"]${at(3000)};
nwr["amenity"~"^(hospital|clinic|doctors)$"]${at(4000)};
nwr["amenity"="pharmacy"]${at(2500)};
nwr["amenity"="place_of_worship"]["religion"="muslim"]${at(1500)};
nwr["shop"~"^(supermarket|mall|department_store)$"]${at(4000)};
nwr["leisure"="park"]${at(3000)};
nwr["natural"="beach"]${at(8000)};
);out center tags 400;`;
  let last = "";
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(20_000),
        headers: { "User-Agent": "Aqar360-website/1.0 (property map nearby places)" } });
      if (!res.ok) { last = `${url} ${res.status}`; continue; }
      return parseOverpass(await res.json());
    } catch (error) {
      last = `${url} ${(error as Error).message}`;
    }
  }
  throw new Error(`all Overpass servers busy (${last})`);
}

/** Places around the grid cell of a point; null when the free service is unavailable (nothing is cached then). */
export async function nearbyPlaces(lat: number, lng: number): Promise<NearbyPlace[] | null> {
  const cell = cellOf(lat, lng);
  const key = `${cell.lat.toFixed(2)},${cell.lng.toFixed(2)}`;
  const [hit] = await db.select().from(nearbyCache).where(eq(nearbyCache.key, key));
  if (hit && Date.now() - hit.fetchedAt.getTime() < TTL_DAYS * 86_400_000) return hit.data as NearbyPlace[];
  try {
    const places = await fetchOverpass(cell.lat, cell.lng);
    await db.insert(nearbyCache).values({ key, data: places, fetchedAt: new Date() })
      .onConflictDoUpdate({ target: nearbyCache.key, set: { data: places, fetchedAt: new Date() } });
    return places;
  } catch (error) {
    console.error("nearby places failed:", (error as Error).message);
    return hit ? (hit.data as NearbyPlace[]) : null;
  }
}
