import { NextResponse, type NextRequest } from "next/server";

import { stopAlerts, updateMyRequest } from "@/lib/intake";
import { readJson, reject, sameOrigin } from "@/lib/request";

/** Customer self-service through the private link (hashed token): update, pause/resume/close, stop alerts. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject(403, "not_permitted", "Cross-site requests are not allowed.");
  const body = await readJson(request, 8_000);
  if (!body || typeof body.token !== "string") return reject(400, "invalid_request", "Invalid request body.");
  const lang = (request.headers.get("referer") || "").includes("/en/") ? "en" : "ar";
  const { action, ...rest } = body;
  const result = action === "stop_alerts" ? await stopAlerts(String(body.token), lang)
    : action === "update" ? await updateMyRequest(rest, lang) : null;
  if (!result) return reject(400, "invalid_request", "Unknown action.");
  if (result.ok) return NextResponse.json({ ok: true, data: result.data }, { headers: { "Cache-Control": "no-store" } });
  const { status, ...error } = result.error;
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}
