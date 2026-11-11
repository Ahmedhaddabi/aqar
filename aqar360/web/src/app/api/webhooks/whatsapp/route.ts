import { after, NextResponse, type NextRequest } from "next/server";

import { agentReply } from "@/lib/wa-agent";
import { handleWebhook, validSignature, waConfig } from "@/lib/whatsapp";

// The WhatsApp agent answers after Meta has its 200 (it waits a few seconds for more messages, then asks the AI).
export const maxDuration = 120;

/** Meta's one-time check when the webhook address is saved in the app dashboard. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const { verifyToken } = await waConfig();
  if (q.get("hub.mode") === "subscribe" && verifyToken && q.get("hub.verify_token") === verifyToken) {
    return new NextResponse(q.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** Incoming messages and delivery receipts; anything without Meta's signature is refused. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!(await validSignature(raw, request.headers.get("x-hub-signature-256")))) return NextResponse.json({ ok: false }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  try {
    const { inbound } = await handleWebhook(payload as Parameters<typeof handleWebhook>[0]);
    if (inbound.length) {
      after(async () => {
        for (const m of inbound) {
          await agentReply(m.contactId, m.messageId).catch((error) => console.error("whatsapp agent:", (error as Error).message));
        }
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("whatsapp webhook failed:", (error as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 }); // Meta retries
  }
}
