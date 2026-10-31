import { NextResponse, type NextRequest } from "next/server";

import { siteUrl } from "@/lib/config";
import { docLink } from "@/lib/doc-link";
import { attemptByReference, markFailed, markPaid } from "@/lib/payments";
import { paymobConfig, verifyPaymobRedirect } from "@/lib/payments/paymob";
import { getThawaniSession } from "@/lib/payments/thawani";

/**
 * The customer comes back from the gateway. The result is never taken from the URL alone: Thawani is asked for the
 * session status, Paymob's redirect is checked with its HMAC. Webhooks confirm the same payment independently.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const q = request.nextUrl.searchParams;
  const reference = provider === "paymob" ? q.get("merchant_order_id") ?? "" : q.get("ref") ?? "";
  const attempt = reference ? await attemptByReference(reference) : null;
  if (!attempt) return NextResponse.redirect(siteUrl, 303);
  const back = (state: string) => NextResponse.redirect(`${docLink(attempt.invoiceId)}&pay=${state}`, 303);
  if (attempt.status === "paid") return back("paid");
  try {
    if (provider === "thawani") {
      if (q.get("state") === "cancel") {
        await markFailed(reference, "cancelled");
        return back("cancelled");
      }
      const session = await getThawaniSession(attempt.providerRef ?? "");
      if (session.payment_status === "paid") {
        const done = await markPaid(reference, { transactionId: session.invoice ?? session.session_id, amount: session.total_amount / 1000,
          raw: { session_id: session.session_id, payment_status: session.payment_status } });
        return back(done.ok ? "paid" : "check");
      }
      if (session.payment_status === "cancelled") await markFailed(reference, "cancelled");
      return back(session.payment_status === "cancelled" ? "cancelled" : "pending");
    }
    if (provider === "paymob") {
      const txn = verifyPaymobRedirect(q);
      if (!txn) return back("pending"); // not verifiable here: the signed webhook decides
      if (txn.success && !txn.pending) {
        const done = await markPaid(reference, { transactionId: txn.id, amount: txn.amountCents / paymobConfig().factor, raw: { id: txn.id, via: "redirect" } });
        return back(done.ok ? "paid" : "check");
      }
      if (!txn.pending) await markFailed(reference, "failed", { id: txn.id, via: "redirect" });
      return back(txn.pending ? "pending" : "failed");
    }
  } catch (error) {
    console.error(`${provider} return check failed:`, (error as Error).message);
  }
  return back("pending");
}
