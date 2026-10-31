import { NextResponse, type NextRequest } from "next/server";

export type ApiError = { code: string; message: string; request_id?: string; fields?: Record<string, string> | null };
export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiError };

/** Visitor IP from the trusted reverse proxy in front of this server (Cloudflare/nginx set X-Forwarded-For). */
export function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
}

/**
 * Rejects cross-site posts. Sec-Fetch-Site comes first: pages with a "no-referrer" policy (my-request, customer
 * invoice links) make browsers send `Origin: null` on their own same-site posts. Origin is the fallback for older browsers.
 */
export function sameOrigin(request: NextRequest) {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export function reply<T>(result: ApiResult<T>) {
  const body = result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
  return NextResponse.json(body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

export function reject(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function readJson(request: NextRequest, maxBytes = 32_000): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get("content-length") || 0) > maxBytes) return null;
  try {
    const text = await request.text();
    if (text.length > maxBytes) return null;
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
