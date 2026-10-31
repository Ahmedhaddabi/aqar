import { NextResponse, type NextRequest } from "next/server";

import type { ApiResult } from "./frappe";

/** Visitor IP from the trusted reverse proxy in front of this server (Cloudflare/nginx set X-Forwarded-For). */
export function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
}

/** Rejects cross-site form posts: browsers always send Origin on POST. */
export function sameOrigin(request: NextRequest) {
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
