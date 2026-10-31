// Photo storage: Vercel Blob in production (BLOB_READ_WRITE_TOKEN); a git-ignored local folder for development only.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { put } from "@vercel/blob";

const MAX_BYTES = 8 * 1024 * 1024;
export const LOCAL_UPLOAD_DIR = path.join(process.cwd(), ".uploads");

/** The file's real type from its first bytes (the browser-provided type and name are not trusted). */
function sniff(bytes: Uint8Array): { ext: string; type: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: "png", type: "image/png" };
  const head = String.fromCharCode(...bytes.slice(0, 12));
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return { ext: "webp", type: "image/webp" };
  if (head.startsWith("%PDF-")) return { ext: "pdf", type: "application/pdf" };
  return null;
}

export type UploadResult = { ok: true; url: string } | { ok: false; error: "invalid" | "storage" };

export const storageConfigured = () => !!process.env.BLOB_READ_WRITE_TOKEN || process.env.NODE_ENV !== "production"
  || process.env.ALLOW_LOCAL_UPLOADS === "1";

export async function uploadImage(file: File, folder: "projects" | "properties" | "receipts" | "cvs" | "docs"): Promise<UploadResult> {
  if (!file || file.size === 0 || file.size > MAX_BYTES) return { ok: false, error: "invalid" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  // PDFs for CVs, documents and receipts; listing photos must be images.
  if (!kind || (kind.ext === "pdf" && folder !== "cvs" && folder !== "docs" && folder !== "receipts")) return { ok: false, error: "invalid" };
  const name = `${folder}/${randomUUID()}.${kind.ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(name, Buffer.from(bytes), { access: "public", contentType: kind.type, addRandomSuffix: false });
    return { ok: true, url: blob.url };
  }
  if (!storageConfigured()) return { ok: false, error: "storage" };
  const target = path.join(LOCAL_UPLOAD_DIR, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return { ok: true, url: `/uploads/${name}` };
}
