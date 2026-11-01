import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { chatAvailable, chatReply, chatSettings, takeChatTurn } from "@/lib/chat";
import { clientIp, readJson, reject, sameOrigin } from "@/lib/request";

const Body = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  lang: z.enum(["ar", "en"]),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) })).min(1).max(30),
});

const BUSY = { ar: "المساعد مشغول حاليا. يمكنك ترك طلبك في صفحة «ابحث لي عن عقار» أو التواصل معنا عبر واتساب.",
  en: "The assistant is busy right now. You can leave your request on the \"Find me a property\" page or message us on WhatsApp." };

/** Website chat: one assistant reply per call; the visitor's browser keeps the conversation. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject(403, "not_permitted", "Cross-site requests are not allowed.");
  const parsed = Body.safeParse(await readJson(request, 64_000));
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") return reject(400, "invalid_request", "Invalid request body.");
  const { sessionId, lang, messages } = parsed.data;
  if (!(await chatAvailable())) return reject(404, "chat_off", "Chat is not available.");
  const ip = clientIp(request);
  if (!(await takeChatTurn(ip, (await chatSettings()).dailyCap))) {
    return NextResponse.json({ ok: true, data: { reply: BUSY[lang], limited: true } }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const reply = await chatReply(messages, { lang, sessionId, ip });
    return NextResponse.json({ ok: true, data: { reply } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("website chat failed:", (error as Error).message);
    return NextResponse.json({ ok: true, data: { reply: BUSY[lang], limited: true } }, { headers: { "Cache-Control": "no-store" } });
  }
}
