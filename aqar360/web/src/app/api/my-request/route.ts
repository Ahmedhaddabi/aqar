import type { NextRequest } from "next/server";

import { frappeCall } from "@/lib/frappe";
import { clientIp, readJson, reject, reply, sameOrigin } from "@/lib/request";

/** Customer self-service through the hashed single-purpose link (F.3 item 6, F.8 test 4). */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject(403, "not_permitted", "Cross-site requests are not allowed.");
  const body = await readJson(request, 8_000);
  if (!body || typeof body.token !== "string") return reject(400, "invalid_request", "Invalid request body.");
  const { action, ...rest } = body;
  const method = action === "stop_alerts" ? "public.stop_alerts" : action === "update" ? "public.update_my_request" : null;
  if (!method) return reject(400, "invalid_request", "Unknown action.");
  const payload = action === "stop_alerts" ? { token: rest.token } : rest;
  return reply(await frappeCall(method, { verb: "POST", body: payload, clientIp: clientIp(request) }));
}
