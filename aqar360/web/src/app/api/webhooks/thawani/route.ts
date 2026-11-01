import { NextResponse, type NextRequest } from "next/server";

import { markFailed, markPaid } from "@/lib/payments";
import { getThawaniSession, validThawaniSignature } from "@/lib/payments/thawani";

const find = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj[key] === "string") return obj[key] as string;
  for (const v of Object.values(obj)) { const hit = find(v, key); if (hit) return hit; }
  return undefined;
};

/** Thawani webhook: signature checked on the raw body, then the session status is fetched from Thawani (source of truth). */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!(await validThawaniSignature(raw, request.headers.get("thawani-signature"), request.headers.get("thawani-timestamp")))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const sessionId = find(payload, "session_id");
  if (!sessionId) return NextResponse.json({ ok: true, ignored: true });
  try {
    const session = await getThawaniSession(sessionId);
    if (session.payment_status === "paid") {
      await markPaid(session.client_reference_id, { transactionId: session.invoice ?? session.session_id, amount: session.total_amount / 1000,
        raw: { session_id: session.session_id, payment_status: session.payment_status, via: "webhook" } });
    } else if (session.payment_status === "cancelled") {
      await markFailed(session.client_reference_id, "cancelled", { via: "webhook" });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("thawani webhook failed:", (error as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 }); // Thawani retries
  }
}
