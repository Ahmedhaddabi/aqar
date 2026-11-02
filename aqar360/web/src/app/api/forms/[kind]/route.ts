import { NextResponse, type NextRequest } from "next/server";

import { linkNewRequest } from "@/lib/customer-auth";
import { isFormKind, submitForm } from "@/lib/intake";
import { clientIp, readJson, reject, sameOrigin } from "@/lib/request";

/** Website forms → CRM (lib/intake.ts): validation, customer match, consent, request number, private link. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isFormKind(kind)) return reject(404, "not_found", "Unknown form.");
  if (!sameOrigin(request)) return reject(403, "not_permitted", "Cross-site requests are not allowed.");
  const body = await readJson(request);
  if (!body) return reject(400, "invalid_request", "Invalid request body.");
  try {
    const result = await submitForm(kind, body, clientIp(request));
    if (result.ok && result.contact) await linkNewRequest(result.contact).catch(() => undefined);
    if (result.ok) return NextResponse.json({ ok: true, data: result.data }, { headers: { "Cache-Control": "no-store" } });
    const { status, ...error } = result.error;
    return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("form submission failed:", (error as Error).message);
    return reject(503, "backend_unavailable", "The service is temporarily unavailable.");
  }
}
