import { readFile } from "node:fs/promises";
import path from "node:path";

import { LOCAL_UPLOAD_DIR } from "@/lib/storage";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

/** Development only: serves photos stored in the local .uploads folder (production uses Vercel Blob URLs). */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  const ext = parts.at(-1)?.split(".").pop() ?? "";
  if (!TYPES[ext] || parts.some((p) => !/^[\w-]+(\.\w+)?$/.test(p))) return new Response("Not found", { status: 404 });
  try {
    const file = await readFile(path.join(LOCAL_UPLOAD_DIR, ...parts));
    return new Response(new Uint8Array(file), { headers: { "Content-Type": TYPES[ext], "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
