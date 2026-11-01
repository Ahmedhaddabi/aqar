import { NextResponse, type NextRequest } from "next/server";

import { markFailed, markPaid } from "@/lib/payments";
import { paymobConfig, verifyPaymobProcessed } from "@/lib/payments/paymob";

/** Paymob "transaction processed" callback (notification_url): HMAC-SHA512 checked before anything is recorded. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const txn = body ? await verifyPaymobProcessed(body, request.nextUrl.searchParams.get("hmac")) : null;
  if (!txn) return NextResponse.json({ ok: false }, { status: 401 });
  if (!txn.reference) return NextResponse.json({ ok: true, ignored: true });
  if (txn.success && !txn.pending) {
    await markPaid(txn.reference, { transactionId: txn.id, amount: txn.amountCents / (await paymobConfig()).factor, raw: { id: txn.id, via: "webhook" } });
  } else if (!txn.pending) {
    await markFailed(txn.reference, "failed", { id: txn.id, via: "webhook" });
  }
  return NextResponse.json({ ok: true });
}
