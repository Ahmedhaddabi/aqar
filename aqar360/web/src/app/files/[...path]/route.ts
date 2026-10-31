import type { NextRequest } from "next/server";

import { frappeFile } from "@/lib/frappe";

const SAFE_SEGMENT = /^[\w\-. ()%]+$/;
const ALLOWED = /^(image\/(png|jpeg|webp|avif|gif|svg\+xml)|application\/pdf|video\/mp4)/;

/** Public Frappe files used by CMS pages (/files/...). Private files (/private/files) are never served. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!path.length || path.some((segment) => segment === ".." || !SAFE_SEGMENT.test(segment))) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const res = await frappeFile(path.map(encodeURIComponent).join("/"));
    const type = String(res.headers["content-type"] || "");
    if (res.status !== 200 || !ALLOWED.test(type)) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(res.body), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff",
        ...(type.startsWith("image/svg") ? { "Content-Security-Policy": "script-src 'none'" } : {}) },
    });
  } catch {
    return new Response("Not available", { status: 502 });
  }
}
