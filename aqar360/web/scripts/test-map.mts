// Croquis plots and the map: coordinate conversion against PROJ, plot geometry, publishing rules, nearby places
// (parsing, cache, API). Temporary rows only; everything is removed at the end. Run: npm run test:map [-- http://localhost:3000]
import "./test-guard.mts";
import { readFileSync } from "node:fs";

import { eq, inArray, like } from "drizzle-orm";

import { db } from "@/db";
import { nearbyCache, plots, properties } from "@/db/schema";
import { distanceM, latLngToUtm, normalizePoint, plotGeometry, toLngLat } from "@/lib/geo";
import { nearbyPlaces, parseOverpass } from "@/lib/nearby";
import { getMapData } from "@/lib/public-data";

const base = process.argv[2];
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const tag = `T${Date.now().toString(36)}`;
const made: number[] = [];
const cacheKeys: string[] = [];

try {
  // ---- Coordinates against PROJ (pyproj 3.7.2 / PROJ 9.5.1) --------------------------------------------------------
  const ref = JSON.parse(readFileSync("scripts/fixtures/geo-reference.json", "utf8")) as { points: { name: string; lat: number; lng: number; zone: number;
    wgs84: { e: number; n: number }; psd93: { e: number; n: number } }[] };
  let worstW = 0, worstP = 0, worstF = 0;
  for (const p of ref.points) {
    const z = p.zone === 39 ? "39" : "40";
    worstW = Math.max(worstW, distanceM(toLngLat(p.wgs84, `wgs84_utm${z}`), [p.lng, p.lat]));
    worstP = Math.max(worstP, distanceM(toLngLat(p.psd93, `psd93_utm${z}`), [p.lng, p.lat]));
    const f = latLngToUtm(p.lat, p.lng, p.zone);
    worstF = Math.max(worstF, Math.hypot(f.e - p.wgs84.e, f.n - p.wgs84.n));
  }
  check(`WGS 84 UTM → lat/lng matches PROJ (worst ${worstW.toFixed(3)} m)`, worstW < 0.05);
  check(`PSD93 UTM → WGS 84 matches PROJ with EPSG:1439 (worst ${worstP.toFixed(3)} m)`, worstP < 0.05);
  check(`forward UTM matches PROJ (worst ${worstF.toFixed(3)} m)`, worstF < 0.05);
  const muscat = ref.points[0];
  const shift = distanceM(toLngLat(muscat.psd93, "wgs84_utm40"), toLngLat(muscat.psd93, "psd93_utm40"));
  check(`choosing the wrong datum moves a plot ~${Math.round(shift)} m (why the choice matters)`, shift > 300 && shift < 500);

  // ---- Plot geometry ---------------------------------------------------------------------------------------------------
  const sq = [{ e: 641100, n: 2609300 }, { e: 641130, n: 2609300 }, { e: 641130, n: 2609340 }, { e: 641100, n: 2609340 }];
  const g = plotGeometry(sq, "wgs84_utm40");
  check("30 × 40 m plot: area 1200 m², sides 30/40/30/40", g?.areaSqm === 1200 && g.sides.join() === "30,40,30,40", JSON.stringify(g && { a: g.areaSqm, s: g.sides }));
  check("polygon closed and centred", !!g && g.polygon.length === 5 && g.polygon[0][0] === g.polygon[4][0] && distanceM(g.center, toLngLat({ e: 641115, n: 2609320 }, "wgs84_utm40")) < 0.5);
  check("Easting/Northing swapped on the sheet are put right", normalizePoint({ e: 2609300, n: 641100 })?.e === 641100);
  check("numbers outside Oman are refused", normalizePoint({ e: 50, n: 60 }) === null && plotGeometry(sq.slice(0, 2), "wgs84_utm40") === null);

  // ---- Publishing rules -------------------------------------------------------------------------------------------------
  const [pub] = await db.insert(properties).values({ code: `TEST-${tag}-A`, kind: "Land", purpose: "sale", salePrice: 50000, status: "available",
    public: true, verified: true, showExactLocation: false }).returning();
  const [priv] = await db.insert(properties).values({ code: `TEST-${tag}-B`, kind: "Land", purpose: "sale", salePrice: 40000, status: "available",
    public: true, verified: true, showExactLocation: false }).returning();
  const [hidden] = await db.insert(properties).values({ code: `TEST-${tag}-C`, kind: "Land", purpose: "sale", salePrice: 30000, status: "available",
    public: false, verified: false }).returning();
  made.push(pub.id, priv.id, hidden.id);
  const row = (propertyId: number, isPublic: boolean) => ({ propertyId, crs: "wgs84_utm40", points: sq, polygon: g!.polygon, centerLat: g!.center[1], centerLng: g!.center[0],
    areaSqm: g!.areaSqm, landUse: "Residential", plotNumber: "123", public: isPublic });
  await db.insert(plots).values([row(pub.id, true), row(priv.id, false), row(hidden.id, true)]);
  const data = await getMapData("en");
  const a = data.listings.find((l) => l.id === pub.code);
  const b = data.listings.find((l) => l.id === priv.code);
  check("published plot: outline, area and land use on the public map", !!a?.plot && a.plot.area_sqm === 1200 && a.plot.land_use === "Residential");
  check("published plot shows the exact place (pin at the plot centre)", !!a?.exact && !!a.point && distanceM(a.point as [number, number], g!.center) < 0.01);
  check("plot number never sent to the website", !JSON.stringify(a).includes("\"123\"") && !JSON.stringify(a).includes("plotNumber"));
  check("staff-only plot stays off the public map (no exact pin either)", !!b && !b.plot && !b.exact && b.point === null);
  check("plot of a property not on the website is not published", !data.listings.some((l) => l.id === hidden.code));

  // ---- Nearby places ------------------------------------------------------------------------------------------------------
  const parsed = parseOverpass({ elements: [
    { lat: 23.6, lon: 58.4, tags: { amenity: "school", name: "Al Noor School", "name:ar": "مدرسة النور" } },
    { center: { lat: 23.61, lon: 58.41 }, tags: { amenity: "hospital", name: "مستشفى" } },
    { lat: 23.6, lon: 58.4, tags: { amenity: "restaurant", name: "Not wanted" } },
    { tags: { shop: "mall" } },
  ] });
  check("Overpass answer: schools/hospitals kept, other things and points without a place dropped", parsed.length === 2 && parsed[0].cat === "school" && parsed[1].cat === "health");
  check("Arabic names kept", parsed[0].nameAr === "مدرسة النور" && parsed[1].nameAr === "مستشفى");
  const key = "16.50,52.00";
  cacheKeys.push(key);
  await db.insert(nearbyCache).values({ key, data: parsed, fetchedAt: new Date() }).onConflictDoUpdate({ target: nearbyCache.key, set: { data: parsed, fetchedAt: new Date() } });
  const cached = await nearbyPlaces(16.501, 51.999);
  check("cached grid cell answered without calling the free service", cached?.length === 2);
  if (base) {
    check("nearby API refuses points outside Oman", (await fetch(`${base}/api/nearby?lat=48.85&lng=2.35`)).status === 400);
    const live = await fetch(`${base}/api/nearby?lat=23.588&lng=58.383`);
    const j = await live.json();
    console.log(`      live OpenStreetMap lookup for Muscat: ${j.data?.unavailable ? "servers busy (graceful message shown)" : `${j.data?.places?.length} places`}`);
    if (!j.data?.unavailable) cacheKeys.push("23.59,58.38");
    check("nearby API answers (places, or a graceful 'not available')", live.status === 200 && Array.isArray(j.data?.places));
    const plotsPage = await fetch(`${base}/admin/plots`, { redirect: "manual" });
    check("staff plots map needs sign-in", plotsPage.status === 307);
    const map = await fetch(`${base}/en/map`);
    check("public map page renders", map.status === 200);
  }
} finally {
  if (made.length) { await db.delete(plots).where(inArray(plots.propertyId, made)); await db.delete(properties).where(inArray(properties.id, made)); }
  await db.delete(nearbyCache).where(eq(nearbyCache.key, "16.50,52.00"));
}
const left = await db.select({ id: properties.id }).from(properties).where(like(properties.code, `TEST-${tag}-%`));
check("test data removed", left.length === 0);
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
