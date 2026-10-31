import type { NextRequest } from "next/server";

import { frappeCall } from "@/lib/frappe";
import { clientIp, readJson, reject, reply, sameOrigin } from "@/lib/request";

const METHODS: Record<string, string> = {
  search: "public.submit_search_request",
  property: "public.submit_property_intake",
  consultation: "public.submit_consultation_request",
};

/** Relays a public form to Frappe, which validates, rate-limits and stores it (api.md). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const method = METHODS[kind];
  if (!method) return reject(404, "not_found", "Unknown form.");
  if (!sameOrigin(request)) return reject(403, "not_permitted", "Cross-site requests are not allowed.");
  const body = await readJson(request);
  if (!body) return reject(400, "invalid_request", "Invalid request body.");
  return reply(await frappeCall(method, { verb: "POST", body, clientIp: clientIp(request) }));
}
