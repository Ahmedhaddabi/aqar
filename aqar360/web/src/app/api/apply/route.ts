import { NextResponse, type NextRequest } from "next/server";

import { submitApplication } from "@/lib/applications";
import { clientIp, reject, sameOrigin } from "@/lib/request";

/** Careers and supplier forms (multipart, optional CV / company profile up to 4 MB). */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject(403, "not_permitted", "Cross-site requests are not allowed.");
  if (Number(request.headers.get("content-length") || 0) > 4.4 * 1024 * 1024) return reject(413, "too_big", "The file is too big.");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reject(400, "invalid_request", "Invalid request body.");
  }
  try {
    const result = await submitApplication(form, clientIp(request));
    if (result.ok) return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    const { status, ...error } = result.error;
    return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("application failed:", (error as Error).message);
    return reject(503, "backend_unavailable", "The service is temporarily unavailable.");
  }
}
