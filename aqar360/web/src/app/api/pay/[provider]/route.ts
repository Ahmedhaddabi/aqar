import { NextResponse, type NextRequest } from "next/server";

import { PAYMENT_PROVIDERS, type PaymentProvider } from "@/db/schema";
import { docLink, validDocLink } from "@/lib/doc-link";
import { startPayment } from "@/lib/payments";
import { reject, sameOrigin } from "@/lib/request";

/** "Pay online" on the customer's invoice page: checks the signed link, then sends the browser to the gateway. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!(PAYMENT_PROVIDERS as readonly string[]).includes(provider)) return reject(404, "not_found", "Unknown gateway.");
  if (!sameOrigin(request)) return reject(403, "not_permitted", "Cross-site requests are not allowed.");
  const form = await request.formData().catch(() => null);
  const id = Number(form?.get("id"));
  const signature = String(form?.get("s") ?? "");
  if (!Number.isInteger(id) || !validDocLink(id, signature)) return reject(404, "not_found", "Unknown invoice.");
  const result = await startPayment(id, provider as PaymentProvider, docLink(id));
  const target = result.ok ? result.url : `${docLink(id)}&pay=${result.reason === "not_payable" ? "paid" : "error"}`;
  return NextResponse.redirect(target, 303);
}
