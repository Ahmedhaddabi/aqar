// Croquis (كروكي) coordinates → map coordinates. Omani plot sketches list corner points as UTM Easting/Northing, either on
// WGS 84 (EPSG:32640 / 32639) or on the older PSD93 datum (EPSG:3440 / 3439, Clarke 1880 RGS ellipsoid). PSD93 points are
// moved to WGS 84 with EPSG:1439 (PDO, position vector, ~0.5 m). Checked against PROJ in scripts/fixtures/geo-reference.json.
// Pure functions: used on the server (saving) and in the browser (live preview).

export const CRS_OPTIONS = ["wgs84_utm40", "psd93_utm40", "wgs84_utm39", "psd93_utm39"] as const;
export type CrsKey = (typeof CRS_OPTIONS)[number];
export type UtmPoint = { label?: string; e: number; n: number };
export type LngLat = [number, number];

const WGS84 = { a: 6378137, f: 1 / 298.257223563 };
const CLARKE_1880_RGS = { a: 6378249.145, f: 1 / 293.465 };
// EPSG:1439 PSD93 → WGS 84, position vector convention.
const PSD93_TO_WGS84 = { tx: -180.624, ty: -225.516, tz: 173.919, rx: -0.81, ry: -1.898, rz: 8.336, ppm: 16.71006 };

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/** Inverse transverse Mercator (UTM, northern hemisphere) → latitude/longitude in degrees on the given ellipsoid. */
export function utmToLatLng(e: number, n: number, zone: number, ell = WGS84): { lat: number; lng: number } {
  const k0 = 0.9996;
  const { a, f } = ell;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const x = e - 500000;
  const m = n / k0;
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const n1 = a / Math.sqrt(1 - e2 * sin1 ** 2);
  const r1 = (a * (1 - e2)) / (1 - e2 * sin1 ** 2) ** 1.5;
  const t1 = tan1 ** 2;
  const c1 = ep2 * cos1 ** 2;
  const d = x / (n1 * k0);
  const lat = phi1 - ((n1 * tan1) / r1) * (d ** 2 / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4) / 24
    + ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6) / 720);
  const lng = (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5) / 120) / cos1;
  return { lat: deg(lat), lng: (zone - 1) * 6 - 180 + 3 + deg(lng) };
}

/** Forward UTM (used by the tests to check round trips). */
export function latLngToUtm(lat: number, lng: number, zone: number, ell = WGS84): { e: number; n: number } {
  const k0 = 0.9996;
  const { a, f } = ell;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const phi = rad(lat);
  const lam = rad(lng - ((zone - 1) * 6 - 180 + 3));
  const nn = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const t = Math.tan(phi) ** 2;
  const c = ep2 * Math.cos(phi) ** 2;
  const aa = Math.cos(phi) * lam;
  const m = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
  const e = k0 * nn * (aa + ((1 - t + c) * aa ** 3) / 6 + ((5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * aa ** 5) / 120) + 500000;
  const n = k0 * (m + nn * Math.tan(phi) * (aa ** 2 / 2 + ((5 - t + 9 * c + 4 * c ** 2) * aa ** 4) / 24
    + ((61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * aa ** 6) / 720));
  return { e, n };
}

function toEcef(lat: number, lng: number, ell: { a: number; f: number }) {
  const e2 = ell.f * (2 - ell.f);
  const phi = rad(lat);
  const lam = rad(lng);
  const nn = ell.a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  return [nn * Math.cos(phi) * Math.cos(lam), nn * Math.cos(phi) * Math.sin(lam), nn * (1 - e2) * Math.sin(phi)];
}

function fromEcef([x, y, z]: number[], ell: { a: number; f: number }) {
  const e2 = ell.f * (2 - ell.f);
  const p = Math.hypot(x, y);
  let phi = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 6; i++) {
    const nn = ell.a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    phi = Math.atan2(z + e2 * nn * Math.sin(phi), p);
  }
  return { lat: deg(phi), lng: deg(Math.atan2(y, x)) };
}

/** PSD93 latitude/longitude → WGS 84 (EPSG:1439, position vector: X' = T + (1 + s)·R·X). */
export function psd93ToWgs84(lat: number, lng: number) {
  const [x, y, z] = toEcef(lat, lng, CLARKE_1880_RGS);
  const s = 1 + PSD93_TO_WGS84.ppm * 1e-6;
  const sec = Math.PI / (180 * 3600);
  const rx = PSD93_TO_WGS84.rx * sec;
  const ry = PSD93_TO_WGS84.ry * sec;
  const rz = PSD93_TO_WGS84.rz * sec;
  const out = [PSD93_TO_WGS84.tx + s * (x - rz * y + ry * z), PSD93_TO_WGS84.ty + s * (rz * x + y - rx * z), PSD93_TO_WGS84.tz + s * (-ry * x + rx * y + z)];
  return fromEcef(out, WGS84);
}

/** One croquis corner → [lng, lat] on WGS 84 (what the map uses). */
export function toLngLat(point: UtmPoint, crs: CrsKey): LngLat {
  const zone = crs.endsWith("39") ? 39 : 40;
  if (crs.startsWith("wgs84")) {
    const { lat, lng } = utmToLatLng(point.e, point.n, zone, WGS84);
    return [lng, lat];
  }
  const local = utmToLatLng(point.e, point.n, zone, CLARKE_1880_RGS);
  const { lat, lng } = psd93ToWgs84(local.lat, local.lng);
  return [lng, lat];
}

/** Plausible Omani UTM values; a croquis read with Easting and Northing swapped is put right. */
export function normalizePoint(p: UtmPoint): UtmPoint | null {
  let { e, n } = p;
  if (!Number.isFinite(e) || !Number.isFinite(n)) return null;
  if (e > 1_000_000 && n < 1_000_000) [e, n] = [n, e];
  if (e < 160_000 || e > 840_000 || n < 1_800_000 || n > 2_950_000) return null;
  return { label: p.label, e, n };
}

/** Area on the grid (m²) from the corner points in order (shoelace). Within ~0.1 % of the true area in UTM. */
export function gridArea(points: UtmPoint[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.e * b.n - b.e * a.n;
  }
  return Math.abs(sum) / 2;
}

export function sideLengths(points: UtmPoint[]) {
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return Math.hypot(b.e - a.e, b.n - a.n);
  });
}

export type PlotGeometry = { polygon: LngLat[]; center: LngLat; areaSqm: number; sides: number[] };

/** Corner points → closed polygon, centre, area and side lengths; null when fewer than 3 usable points. */
export function plotGeometry(points: UtmPoint[], crs: CrsKey): PlotGeometry | null {
  const clean = points.map(normalizePoint).filter((p): p is UtmPoint => !!p);
  if (clean.length < 3) return null;
  const ring = clean.map((p) => toLngLat(p, crs));
  const center: LngLat = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  return { polygon: [...ring, ring[0]], center, areaSqm: Math.round(gridArea(clean) * 10) / 10, sides: sideLengths(clean).map((v) => Math.round(v * 100) / 100) };
}

/** Straight-line distance in metres (haversine). */
export function distanceM(a: LngLat, b: LngLat) {
  const R = 6_371_008.8;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
