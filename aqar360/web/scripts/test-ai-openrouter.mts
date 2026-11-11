// All AI through OpenRouter, on the TEST database with a pretend OpenRouter (no real key is used): the request shape
// (system, tools, JSON output, images, PDFs, tool results), the reply shape, and the website chat and staff helpers end to end.
// npm run test:ai-openrouter
import "./test-guard.mts";

import { aiReady, create, extractRequest, fromOpenRouter, textOf, toOpenRouter } from "@/lib/ai";
import { chatAvailable, chatReply } from "@/lib/chat";
import { removeIntegration, saveIntegration } from "@/lib/integrations";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// ---- Pretend OpenRouter: answers from a script, records every request -------------------------------------------------
type Body = ReturnType<typeof toOpenRouter> & { messages: { role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }[] };
const bodies: Body[] = [];
let script: ((b: Body) => object)[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url === "https://openrouter.ai/api/v1/chat/completions") {
    const body = JSON.parse(String(init?.body)) as Body;
    bodies.push(body);
    const next = script.shift();
    return new Response(JSON.stringify(next ? next(body) : { error: { code: 503, message: "no script" } }), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;
const say = (text: string) => () => ({ choices: [{ finish_reason: "stop", message: { content: text } }] });
const call = (name: string, args: object) => () => ({ choices: [{ finish_reason: "tool_calls", message: { content: null,
  tool_calls: [{ id: `call_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] });

try {
  await removeIntegration("openrouter");
  await removeIntegration("anthropic");

  // ---- Pure translation ----------------------------------------------------------------------------------------------
  const req = toOpenRouter("m/x", {
    max_tokens: 100, system: "You are helpful.", output_config: { effort: "low", format: { type: "json_schema", schema: { type: "object" } } },
    tools: [{ name: "find", description: "Find", input_schema: { type: "object", properties: {} } }],
    messages: [
      { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } }, { type: "text", text: "Read" }] },
      { role: "assistant", content: [{ type: "text", text: "Looking" }, { type: "tool_use", id: "t1", name: "find", input: { q: 1 } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{\"n\":2}" }] },
      { role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "PDF" } }] },
    ],
  }) as unknown as Body & { tools: { function: { name: string } }[]; response_format?: { type: string }; provider?: { require_parameters: boolean } };
  check("system becomes the first message", req.messages[0].role === "system" && req.messages[0].content === "You are helpful.");
  check("image becomes a data URL", JSON.stringify(req.messages[1].content).includes("data:image/png;base64,AAA"));
  check("assistant tool call kept with its id", req.messages[2].role === "assistant" && JSON.stringify(req.messages[2].tool_calls).includes("\"id\":\"t1\""));
  check("tool result becomes a tool message", req.messages[3].role === "tool" && req.messages[3].tool_call_id === "t1" && req.messages[3].content === "{\"n\":2}");
  check("PDF becomes a file part", JSON.stringify(req.messages[4].content).includes("data:application/pdf;base64,PDF"));
  check("tools, JSON output and only providers that support them", req.tools[0].function.name === "find" && req.response_format?.type === "json_schema"
    && req.provider?.require_parameters === true);
  const back = fromOpenRouter({ choices: [{ finish_reason: "tool_calls", message: { content: "ok", tool_calls: [{ id: "c", type: "function",
    function: { name: "find", arguments: "{\"q\":3}" } }] } }] }, "m/x");
  check("reply: text and tool call", back.stop_reason === "tool_use" && back.content.length === 2 && JSON.stringify(back.content[1]).includes("\"q\":3"));
  check("reply: content filter counts as a refusal", fromOpenRouter({ choices: [{ finish_reason: "content_filter", message: { content: "" } }] }, "m").stop_reason === "refusal");

  // ---- Off until a key is saved ---------------------------------------------------------------------------------------
  check("AI off with no key", !(await aiReady()));
  await saveIntegration("openrouter", { apiKey: "sk-or-fake", model: "fake/model" }, [], true);
  check("AI on with an OpenRouter key", await aiReady());

  // ---- A call through OpenRouter -----------------------------------------------------------------------------------------
  script = [say("Hello there")];
  const msg = await create({ max_tokens: 50, system: "s", messages: [{ role: "user", content: "hi" }] });
  check("create: answered through OpenRouter with the chosen model", textOf(msg) === "Hello there" && bodies.at(-1)?.model === "fake/model");

  // ---- Structured output (a pasted message → request fields) --------------------------------------------------------
  script = [say(JSON.stringify({ name: "Salim", phone: null, email: null, language: "ar", kind: "search", subtype: "Rent", propertyType: "Apartment",
    areaIds: [], budgetMin: null, budgetMax: 400, bedrooms: 2, timing: null, notes: "" }))];
  const ex = await extractRequest("أبي شقة للإيجار غرفتين بحدود 400");
  check("extract: JSON reply parsed into the form", ex?.budgetMax === 400 && ex.subtype === "Rent", JSON.stringify(ex));

  // ---- Website chat with a tool call ----------------------------------------------------------------------------------
  script = [call("search_listings", { purpose: "Rent", max_price: 400 }), (b) => {
    const tool = b.messages.find((m) => m.role === "tool");
    return say(tool ? "Here is what we have." : "no tool result")();
  }];
  const reply = await chatReply([{ role: "user", content: "Flat to rent under 400?" }], { lang: "en", sessionId: "t" });
  check("website chat: tool result sent back, then the answer", reply === "Here is what we have.", reply);
  check("website chat: available once switched on (with OpenRouter)", typeof (await chatAvailable()) === "boolean");
} finally {
  globalThis.fetch = realFetch;
  await removeIntegration("openrouter");
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll OpenRouter AI checks passed");
  process.exit(failures ? 1 : 0);
}
