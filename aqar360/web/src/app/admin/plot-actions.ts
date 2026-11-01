"use server";

import { eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { documents, plots, properties } from "@/db/schema";
import { aiReady, type CroquisFields, readCroquis, underLimit } from "@/lib/ai";
import { audit, requireApp } from "@/lib/auth";
import { CRS_OPTIONS, normalizePoint, plotGeometry } from "@/lib/geo";
import { uploadImage } from "@/lib/storage";

const CROQUIS_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

/**
 * Stores the croquis privately on the property (Documents) and, when AI is connected, reads the plot details and
 * corner coordinates for staff to check. The file is kept; nothing is saved to the plot until staff press Save.
 */
export async function uploadCroquis(form: FormData): Promise<{ ok: boolean; documentId?: number; read?: CroquisFields | null; error?: string }> {
  const user = await requireApp("crm", ["admin", "manager"]);
  const propertyId = Number(form.get("propertyId"));
  const file = form.get("file");
  if (!Number.isInteger(propertyId) || !(file instanceof File) || file.size > 4 * 1024 * 1024) return { ok: false, error: "file" };
  const stored = await uploadImage(file, "docs");
  if (!stored.ok) return { ok: false, error: "file" };
  const [doc] = await db.insert(documents).values({ ownerType: "property", ownerId: propertyId, title: "Croquis · كروكي", category: "croquis",
    url: stored.url, mime: file.type.slice(0, 80), size: file.size, shared: false, uploadedBy: user.id }).returning({ id: documents.id });
  await audit("croquis_uploaded", "property", propertyId, { document: doc.id }, user.id);
  if (!(await aiReady()) || !(await underLimit(user.id))) return { ok: true, documentId: doc.id, read: null };
  const type = CROQUIS_TYPES.find((t) => t === file.type);
  if (!type) return { ok: true, documentId: doc.id, read: null };
  try {
    await audit("ai_read_croquis", "property", propertyId, {}, user.id);
    const read = await readCroquis(Buffer.from(await file.arrayBuffer()).toString("base64"), type);
    return { ok: true, documentId: doc.id, read: read?.isCroquis ? read : null };
  } catch (error) {
    console.error("croquis reading failed:", (error as Error).message);
    return { ok: true, documentId: doc.id, read: null };
  }
}

const Point = z.object({ label: z.string().trim().max(20).optional(), e: z.coerce.number(), n: z.coerce.number() });
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

/** Saves the plot; the outline is always recomputed here from the corner points (the browser preview is not trusted). */
export async function savePlot(form: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireApp("crm", ["admin", "manager"]);
  let points: unknown;
  try { points = JSON.parse(String(form.get("points") ?? "[]")); } catch { return { ok: false, error: "points" }; }
  const parsed = z.object({
    propertyId: z.coerce.number().int().positive(), crs: z.enum(CRS_OPTIONS), plotNumber: text(40), block: text(40), location: text(120), landUse: text(60),
    statedAreaSqm: z.union([z.literal("").transform(() => null), z.coerce.number().positive().max(10_000_000)]).optional(),
    notes: z.string().trim().max(1000).default(""), documentId: z.union([z.literal("").transform(() => null), z.coerce.number().int().positive()]).optional(),
  }).safeParse(Object.fromEntries([...form.entries()].filter(([k, v]) => typeof v === "string" && !["points", "public", "useAsLocation"].includes(k))));
  const pts = z.array(Point).min(3).max(60).safeParse(points);
  if (!parsed.success || !pts.success) return { ok: false, error: "fields" };
  const clean = pts.data.map((p) => normalizePoint({ label: p.label || undefined, e: p.e, n: p.n }));
  if (clean.some((p) => !p)) return { ok: false, error: "points" };
  const geo = plotGeometry(clean as { e: number; n: number }[], parsed.data.crs);
  if (!geo) return { ok: false, error: "points" };
  const v = parsed.data;
  const row = { plotNumber: v.plotNumber, block: v.block, location: v.location, landUse: v.landUse, statedAreaSqm: v.statedAreaSqm ?? null, crs: v.crs,
    points: clean as { label?: string; e: number; n: number }[], polygon: geo.polygon, centerLat: geo.center[1], centerLng: geo.center[0], areaSqm: geo.areaSqm,
    public: form.get("public") === "on", notes: v.notes, ...(v.documentId ? { documentId: v.documentId } : {}), updatedAt: new Date() };
  await db.insert(plots).values({ propertyId: v.propertyId, createdBy: user.id, ...row }).onConflictDoUpdate({ target: plots.propertyId, set: row });
  if (form.get("useAsLocation") === "on") {
    await db.update(properties).set({ lat: geo.center[1], lng: geo.center[0], updatedAt: new Date() }).where(eq(properties.id, v.propertyId));
  }
  await audit("plot_saved", "property", v.propertyId, { points: clean.length, crs: v.crs, public: row.public }, user.id);
  revalidateTag("aqar-content");
  revalidatePath(`/admin/properties/${v.propertyId}`);
  return { ok: true };
}

export async function deletePlot(form: FormData) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const propertyId = Number(form.get("propertyId"));
  if (!Number.isInteger(propertyId)) return;
  await db.delete(plots).where(eq(plots.propertyId, propertyId));
  await audit("plot_deleted", "property", propertyId, {}, user.id);
  revalidateTag("aqar-content");
  revalidatePath(`/admin/properties/${propertyId}`);
}
