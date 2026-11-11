// The WhatsApp agent on the TEST database, with a pretend AI and a pretend WhatsApp (no real key or number is used):
// Arabic and English chats, language switching, search, compare, recommend, photos, viewing requests, handover,
// staff-approve drafts, pausing, office hours and the checks that stop it from answering.
// npm run test:wa-agent
import "./test-guard.mts";

import { eq, inArray, like } from "drizzle-orm";

import { db } from "@/db";
import { activities, areas, chatUsage, contacts, images, notifications, properties, settings, users, waBot, waMessages } from "@/db/schema";
import { removeIntegration, saveIntegration } from "@/lib/integrations";
import { agentReply, botSettings, botState, type ChatRequest, type ChatResponse, deliver, inOfficeHours, languageOf, runTool, setPaused, toTurns } from "@/lib/wa-agent";
import { handleWebhook } from "@/lib/whatsapp";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const tag = `wa${Date.now().toString(36)}`;
const made = { contacts: [] as number[], properties: [] as number[], areas: [] as number[], users: [] as number[] };

// ---- Pretend WhatsApp: every Graph API call is recorded and answered with a message id ----------------------------------
const sent: { type: string; to: string; text?: string; link?: string; caption?: string }[] = [];
const typing: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://graph.facebook.com/")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.typing_indicator) { typing.push(body.message_id); return new Response(JSON.stringify({ success: true }), { status: 200 }); }
    sent.push({ type: body.type, to: body.to, text: body.text?.body, link: body.image?.link, caption: body.image?.caption });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${tag}.${sent.length}` }] }), { status: 200 });
  }
  if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [] }), { status: 200 });
  return realFetch(input, init);
}) as typeof fetch;

// ---- Pretend AI (OpenRouter's chat format): a script of turns; each turn sees the request and answers with tool calls or text --
type Req = ChatRequest;
type Turn = (req: Req) => { tools?: { name: string; input: Record<string, unknown> }[]; text?: string; filtered?: boolean };
const requests: Req[] = [];
function fakeAi(turns: Turn[]) {
  let i = 0;
  return async (req: Req): Promise<ChatResponse> => {
    requests.push(structuredClone(req));
    const turn = turns[Math.min(i++, turns.length - 1)](req);
    const tool_calls = (turn.tools ?? []).map((t, n) => ({ id: `call_${i}_${n}`, type: "function" as const, function: { name: t.name, arguments: JSON.stringify(t.input) } }));
    return { choices: [{ finish_reason: turn.filtered ? "content_filter" : tool_calls.length ? "tool_calls" : "stop",
      message: { content: turn.text ?? null, ...(tool_calls.length ? { tool_calls } : {}) } }] };
  };
}
/** The tool results sent back after the model's last tool calls, in call order. */
const lastToolResults = (req: Req) => {
  const out: unknown[] = [];
  for (let k = req.messages.length - 1; k >= 0 && req.messages[k].role === "tool"; k--) out.unshift(JSON.parse(String(req.messages[k].content)));
  return out as Record<string, never>[];
};
const systemText = (req: Req) => (req.messages[0].role === "system" ? String(req.messages[0].content) : "");

async function setBot(values: Record<string, unknown>) {
  await db.insert(settings).values(Object.entries(values).map(([key, value]) => ({ key, value })))
    .onConflictDoUpdate({ target: settings.key, set: { value: settings.value } });
  for (const [key, value] of Object.entries(values)) await db.update(settings).set({ value }).where(eq(settings.key, key));
}
let waSeq = 0;
async function customerSays(phone: string, text: string, name = "Customer", sentAt = new Date()) {
  const res = await handleWebhook({ entry: [{ changes: [{ field: "messages", value: { contacts: [{ wa_id: phone.slice(1), profile: { name } }],
    messages: [{ from: phone.slice(1), id: `wamid.in.${tag}.${++waSeq}`, timestamp: String(Math.floor(sentAt.getTime() / 1000)), type: "text", text: { body: text } }] } }] }] });
  return res.inbound[0];
}

try {
  await saveIntegration("whatsapp", { token: "EAAfake", phoneNumberId: "123", appSecret: "app-secret-1" }, [], true);
  await saveIntegration("openrouter", { apiKey: "sk-or-fake", model: "fake/default-model" }, [], true);
  await setBot({ waBotEnabled: true, waBotMode: "auto", waBotHours: "always", waBotDailyCap: 200 });
  check("reply wait: 2 seconds by default", (await botSettings()).delay === 2);
  await setBot({ waBotDelay: 7 });
  check("reply wait: set by the admin", (await botSettings()).delay === 7);
  await setBot({ waBotDelay: 0 });
  check("reply wait: 0 answers at once", (await botSettings()).delay === 0);

  // Listings: two apartments for rent in one area, a villa for sale in another, and one hidden listing.
  const [khoudh] = await db.insert(areas).values({ slug: `${tag}-khoudh`, nameEn: "Al Khoudh Test", nameAr: "الخوض تجربة" }).returning();
  const [qurum] = await db.insert(areas).values({ slug: `${tag}-qurum`, nameEn: "Qurum Test", nameAr: "القرم تجربة" }).returning();
  made.areas.push(khoudh.id, qurum.id);
  const base = { public: true, verified: true, status: "available" as const };
  const rows = await db.insert(properties).values([
    { ...base, code: `${tag}-A1`, kind: "Apartment", purpose: "rent", rentPrice: 380, bedrooms: 2, sizeSqm: 120, areaId: khoudh.id, coverImage: "/uploads/a1-cover.jpg", descriptionAr: "شقة قريبة من الجامعة", descriptionEn: "Near the university" },
    { ...base, code: `${tag}-A2`, kind: "Apartment", purpose: "rent", rentPrice: 450, bedrooms: 3, sizeSqm: 150, areaId: khoudh.id },
    { ...base, code: `${tag}-A3`, kind: "Apartment", purpose: "rent", rentPrice: 300, bedrooms: 2, sizeSqm: 90, areaId: khoudh.id },
    { ...base, code: `${tag}-V1`, kind: "Villa", purpose: "sale", salePrice: 180000, bedrooms: 5, sizeSqm: 400, areaId: qurum.id },
    { code: `${tag}-H1`, kind: "Apartment", purpose: "rent", rentPrice: 200, bedrooms: 2, areaId: khoudh.id, public: false, verified: true, status: "available" },
  ]).returning();
  made.properties.push(...rows.map((r) => r.id));
  const [a1] = rows;
  await db.insert(images).values([1, 2, 3, 4, 5].map((n) => ({ ownerType: "property" as const, ownerId: a1.id, url: `https://cdn.example.com/a1-${n}.jpg`, captionAr: `صورة ${n}`, captionEn: `Photo ${n}`, sort: n })));

  // ---- Pure parts ----------------------------------------------------------------------------------------------------
  check("language: Arabic", languageOf("هلا أبي شقة") === "ar");
  check("language: English", languageOf("Hi, I need a flat in Qurum") === "en");
  check("language: mostly English with a code", languageOf(`Compare ${tag}-A1 and A2 please`) === "en");
  check("office hours: Sunday 10:00 Muscat", inOfficeHours(new Date("2026-11-08T06:00:00Z")));
  check("office hours: Sunday 20:00 Muscat is outside", !inOfficeHours(new Date("2026-11-08T16:00:00Z")));
  check("office hours: Friday is the weekend", !inOfficeHours(new Date("2026-11-13T06:00:00Z")));
  const m = (id: number, direction: "in" | "out", body: string, status = "sent") => ({ id, direction, body, status, contactId: 1, waId: null, phone: "+968", error: null,
    userId: null, bot: false, media: [], createdAt: new Date() }) as typeof waMessages.$inferSelect;
  const turns = toTurns([m(1, "out", "template hello"), m(2, "in", "hi"), m(3, "in", "flat?"), m(4, "out", "draft", "draft"), m(5, "out", "Sure")]);
  check("history: starts with the customer, merges, drops drafts", turns.length === 2 && turns[0].role === "user" && turns[0].content === "hi\nflat?" && turns[1].content === "Sure");

  // ---- Arabic conversation: preferences, search, photos -----------------------------------------------------------
  const phone = `+9689${String(Date.now()).slice(-7)}`;
  const first = await customerSays(phone, "هلا، أبي شقة للإيجار في الخوض بحدود 400 ريال، غرفتين", "سالم");
  made.contacts.push(first.contactId);
  check("webhook hands the new message to the agent", !!first.contactId && !!first.messageId);
  // A message Meta retried hours later (e.g. while the webhook was refusing it) is saved but not answered again.
  const late = await handleWebhook({ entry: [{ changes: [{ field: "messages", value: { messages: [{ from: phone.slice(1), id: `wamid.in.${tag}.late`,
    timestamp: String(Math.floor(Date.now() / 1000) - 3 * 3600), type: "text", text: { body: "old message" } }] } }] }] });
  const [lateRow] = await db.select().from(waMessages).where(eq(waMessages.waId, `wamid.in.${tag}.late`));
  check("retried old message: saved with its real time, no automatic answer", late.inbound.length === 0 && !!lateRow && Date.now() - lateRow.createdAt.getTime() > 2 * 3600_000);
  let searchResult: { listings?: { code: string }[] } = {};
  const r1 = await agentReply(first.contactId, first.messageId, { waitMs: 0, chat: fakeAi([
    () => ({ tools: [{ name: "save_preferences", input: { purpose: "rent", property_type: "Apartment", area_ids: [khoudh.id], budget_max: 400, bedrooms: 2 } },
      { name: "search_properties", input: { purpose: "rent", property_type: "Apartment", area_ids: [khoudh.id], max_price: 400 } }] }),
    (req) => { searchResult = lastToolResults(req)[1]; return { tools: [{ name: "send_photos", input: { code: `${tag}-A1` } }] }; },
    () => ({ text: "هلا والله! عندي لك شقتين في الخوض ضمن ميزانيتك…" }),
  ]) });
  const req1 = requests[0];
  check("typing: blue ticks and typing shown on the customer's message", typing.includes(`wamid.in.${tag}.${waSeq}`), JSON.stringify(typing));
  check("Arabic: reply sent automatically", r1.status === "sent", JSON.stringify(r1));
  check("Arabic: told to answer in Arabic", systemText(req1).includes("reply in Arabic"));
  check("prompt asks for the Omani tone and to switch language", systemText(req1).includes("Omani") && systemText(req1).includes("switch when they switch"));
  check("OpenRouter: the model from Integrations, tools offered", req1.model === "fake/default-model" && req1.tools.some((f) => f.function.name === "search_properties"));
  check("prompt: default instructions under the fixed rules", systemText(req1).indexOf("Fixed rules") < systemText(req1).indexOf("Instructions from Aqar 360") && systemText(req1).includes("هلا والله"));
  check("search: only public, available listings within budget", (searchResult.listings ?? []).map((l) => l.code).sort().join() === [`${tag}-A1`, `${tag}-A3`].sort().join(),
    JSON.stringify(searchResult));
  check("search: hidden listing never shown", !JSON.stringify(searchResult).includes(`${tag}-H1`));
  const state1 = await botState(first.contactId);
  check("preferences saved", state1.preferences.budgetMax === 400 && state1.preferences.bedrooms === 2 && state1.preferences.areaIds?.[0] === khoudh.id && state1.language === "ar");
  const texts = sent.filter((s) => s.type === "text");
  const photos = sent.filter((s) => s.type === "image");
  check("WhatsApp: text then 4 photos", texts.length === 1 && photos.length === 4 && sent[0].type === "text", JSON.stringify(sent.map((s) => s.type)));
  check("photos: cover first with an absolute link, caption has the code and the listing link", photos[0].link?.startsWith("http") === true && photos[0].link.endsWith("/uploads/a1-cover.jpg")
    && (photos[0].caption ?? "").includes(`${tag}-A1`) && (photos[0].caption ?? "").includes("/map?listing="), JSON.stringify(photos[0]));
  const out1 = await db.select().from(waMessages).where(eq(waMessages.contactId, first.contactId));
  check("recorded: 5 agent messages marked as the agent", out1.filter((x) => x.direction === "out" && x.bot).length === 5);
  check("recorded: photos kept on the message", out1.some((x) => x.media.length === 1));

  // ---- Already answered: no double reply ---------------------------------------------------------------------------
  check("already answered: no second reply", (await agentReply(first.contactId, null, { waitMs: 0, chat: fakeAi([() => ({ text: "x" })]) })).reason === "already_answered");

  // ---- Several quick messages: only the newest answers --------------------------------------------------------------
  const q1 = await customerSays(phone, "Hi again");
  const q2 = await customerSays(phone, `Can you compare ${tag}-A1 and ${tag}-A2?`);
  check("older message waits for the newest", (await agentReply(first.contactId, q1.messageId, { waitMs: 0, chat: fakeAi([() => ({ text: "x" })]) })).reason === "newer_message");
  let compared: { listings?: { code: string; pricePerSqm: number | null; areaMedianPricePerSqm: number | null; vsAreaMedian: string | null }[]; lowestPricePerSqm?: string } = {};
  const before = sent.length;
  const r2 = await agentReply(first.contactId, q2.messageId, { waitMs: 0, chat: fakeAi([
    () => ({ tools: [{ name: "compare_properties", input: { codes: [`${tag}-A1`, `${tag}-A2`], purpose: "rent" } }] }),
    (req) => { compared = lastToolResults(req)[0]; return { text: `A1 is better value per m².` }; },
  ]) });
  const req2 = requests[requests.length - 1];
  check("English: switched language with the customer", r2.status === "sent" && systemText(req2).includes("reply in English"));
  check("English: both messages reach the AI as one turn", JSON.stringify(req2.messages).includes("Hi again\\nCan you compare"));
  check("compare: price per m² and area median", compared.listings?.[0]?.pricePerSqm === 3 && compared.listings?.[0]?.areaMedianPricePerSqm === 3 && compared.lowestPricePerSqm !== undefined,
    JSON.stringify(compared));
  check("compare: one text sent", sent.length === before + 1 && sent[sent.length - 1].text?.includes("better value") === true);

  // ---- Tools on their own ------------------------------------------------------------------------------------------
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, first.contactId));
  const ctx = { contactId: first.contactId, lang: "en" as const, photos: [], handedOver: null, contact };
  const rec = await runTool("recommend_properties", {}, ctx) as { recommendations: { code: string; why: string[] }[] };
  check("recommend: best match first, with reasons", rec.recommendations?.[0]?.code === `${tag}-A1` && rec.recommendations[0].why.length >= 2
    && !rec.recommendations.some((r) => r.code === `${tag}-A2`), JSON.stringify(rec));
  check("details: hidden listing is not found", "error" in (await runTool("property_details", { code: `${tag}-H1` }, ctx) as object));
  const det = await runTool("property_details", { code: `${tag}-a1` }, ctx) as { description?: string; photos?: number };
  check("details: code is case-insensitive, has description and photo count", det.description === "Near the university" && det.photos === 6, JSON.stringify(det));
  check("photos: none for a listing without photos", (await runTool("send_photos", { code: `${tag}-A2` }, ctx) as { ok: boolean }).ok === false);
  const viewing = await runTool("request_viewing", { code: `${tag}-A1`, preferred_time: "Thursday evening" }, ctx) as { ok: boolean };
  const [task] = await db.select().from(activities).where(eq(activities.contactId, first.contactId)).then((r) => r.filter((x) => x.type === "follow_up"));
  check("viewing: a follow-up for the team with the property", viewing.ok && !!task && task.propertyId === a1.id && task.body.includes("Thursday evening"));
  const times = await runTool("viewing_times", { code: `${tag}-A1` }, ctx) as { times: { time: string; say: string }[] };
  check("viewing times: free times offered", times.times.length > 0 && !!times.times[0].say, JSON.stringify(times).slice(0, 200));
  check("book: needs the customer's agreement", (await runTool("book_viewing", { code: `${tag}-A1`, time: times.times[0].time, customer_agreed: false }, ctx) as { ok: boolean }).ok === false);
  const booked = await runTool("book_viewing", { code: `${tag}-A1`, time: times.times[0].time, customer_agreed: true }, ctx) as { ok: boolean; see_or_change?: string };
  const [visit] = await db.select().from(activities).where(eq(activities.contactId, first.contactId)).then((r) => r.filter((x) => x.type === "viewing"));
  check("book: viewing saved at that time with a link to change it", booked.ok && !!visit && visit.dueAt?.toISOString() === times.times[0].time
    && visit.propertyId === a1.id && !!booked.see_or_change, JSON.stringify(booked));
  const again = await runTool("book_viewing", { code: `${tag}-A1`, time: times.times[0].time, customer_agreed: true }, ctx) as { ok: boolean };
  check("book: the same time cannot be booked twice", again.ok === false);
  check("save request: needs the customer's agreement", (await runTool("save_request", { purpose: "Rent", property_type: "Apartment", area_ids: [khoudh.id], budget_max: 400, customer_agreed: false }, ctx) as { ok: boolean }).ok === false);

  // ---- Handover --------------------------------------------------------------------------------------------------
  const staff = (await db.insert(users).values({ name: `${tag} boss`, email: `${tag}@example.com`, passwordHash: "x", role: "admin", apps: ["crm"] }).returning())[0];
  made.users.push(staff.id);
  const h = await customerSays(phone, "ابغى أكلم موظف، عندي عرض على الشقة");
  const r3 = await agentReply(first.contactId, h.messageId, { waitMs: 0, chat: fakeAi([
    () => ({ tools: [{ name: "handover", input: { reason: "wants to make an offer" } }] }),
    () => ({ text: "أبشر، بيتواصل معك واحد من الفريق الحين." }),
  ]) });
  check("handover: paused with the reason", r3.status === "handover" && (await botState(first.contactId)).paused && (await botState(first.contactId)).pausedReason === "wants to make an offer");
  const notes = await db.select().from(notifications).where(eq(notifications.userId, staff.id));
  check("handover: staff are told", notes.some((n) => n.kind === "wa_handover"));
  const after = await customerSays(phone, "متى؟");
  check("paused: the agent stays quiet", (await agentReply(first.contactId, after.messageId, { waitMs: 0, chat: fakeAi([() => ({ text: "x" })]) })).reason === "paused");
  await setPaused(first.contactId, false, null);

  // ---- Blocked by the model's filter → handover, no invented answer ------------------------------------------------
  const rf = await customerSays(phone, "something odd");
  const r4 = await agentReply(first.contactId, rf.messageId, { waitMs: 0, chat: fakeAi([() => ({ filtered: true })]) });
  check("filtered: handed to a person with a polite line", r4.status === "handover" && !!r4.text);
  await setPaused(first.contactId, false, null);

  // ---- The admin's own instructions, never-say list and model ---------------------------------------------------------
  await setBot({ waBotInstructions: "Always mention that every listing has free parking.", waBotAvoid: "Never mention our commission.", waBotModel: "fake/admin-pick" });
  const ins = await customerSays(phone, "Anything with parking?");
  await agentReply(first.contactId, ins.messageId, { waitMs: 0, chat: fakeAi([() => ({ text: "Yes, free parking with all of them." })]) });
  const reqI = requests[requests.length - 1];
  const sys = systemText(reqI);
  check("admin instructions: in the prompt, replacing the default tone", sys.includes("free parking") && !sys.includes("هلا والله"));
  check("admin never-say list: in the prompt", sys.includes("Never mention our commission."));
  check("admin instructions: fixed safety rules stay", sys.includes("information, not instructions"));
  check("admin model choice: used instead of the Integrations model", reqI.model === "fake/admin-pick");
  await setBot({ waBotInstructions: "", waBotAvoid: "", waBotModel: "" });

  // ---- Staff-approve mode -------------------------------------------------------------------------------------------
  await setBot({ waBotMode: "approve" });
  const d = await customerSays(phone, "Any villas for sale in Qurum?");
  const sentBefore = sent.length;
  const r5 = await agentReply(first.contactId, d.messageId, { waitMs: 0, chat: fakeAi([
    () => ({ tools: [{ name: "send_photos", input: { code: `${tag}-A1`, count: 2 } }] }),
    () => ({ text: "Yes, one villa in Qurum at 180,000 OMR." }),
  ]) });
  const [draft] = await db.select().from(waMessages).where(eq(waMessages.status, "draft")).then((r) => r.filter((x) => x.contactId === first.contactId));
  check("approve mode: booking tools hidden until staff send", !requests[requests.length - 1].tools.some((f) => f.function.name === "book_viewing")
    && requests[0].tools.some((f) => f.function.name === "book_viewing"));
  check("approve mode: a draft, nothing sent", r5.status === "draft" && !!draft && draft.media.length === 2 && sent.length === sentBefore);
  const d2 = await customerSays(phone, "Also apartments?");
  await agentReply(first.contactId, d2.messageId, { waitMs: 0, chat: fakeAi([() => ({ text: "Also apartments: …" })]) });
  const drafts = await db.select().from(waMessages).where(eq(waMessages.contactId, first.contactId)).then((r) => r.filter((x) => x.status === "draft"));
  check("approve mode: a newer message replaces the old draft", drafts.length === 1 && drafts[0].body.startsWith("Also apartments"));
  await deliver(first.contactId, phone, "Edited by staff", [drafts[0].media[0]].filter(Boolean), staff.id, drafts[0].id);
  const [approved] = await db.select().from(waMessages).where(eq(waMessages.id, drafts[0].id));
  check("approve: the draft becomes the sent message by the staff member", approved.status === "sent" && approved.userId === staff.id && approved.waId !== null
    && sent[sent.length - 1].text === "Edited by staff");

  // ---- Checks that stop it ------------------------------------------------------------------------------------------
  await setBot({ waBotMode: "auto", waBotHours: "after_hours" });
  const o = await customerSays(phone, "hello?");
  check("after-hours mode: quiet in office hours", (await agentReply(first.contactId, o.messageId, { waitMs: 0, now: new Date("2026-11-08T06:00:00Z"), chat: fakeAi([() => ({ text: "x" })]) })).reason === "office_hours");
  await setBot({ waBotHours: "always" });
  const stop = await customerSays(phone, "STOP");
  check("STOP: no reply", (await agentReply(first.contactId, stop.messageId, { waitMs: 0, chat: fakeAi([() => ({ text: "x" })]) })).reason === "stop");
  await setBot({ waBotEnabled: false });
  const off = await customerSays(phone, "hi");
  check("switched off: no reply", (await agentReply(first.contactId, off.messageId, { waitMs: 0, chat: fakeAi([() => ({ text: "x" })]) })).reason === "off");
  await setBot({ waBotEnabled: true, waBotDailyCap: 10 });
  await db.insert(chatUsage).values({ day: new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10), key: "wa_bot", count: 999 })
    .onConflictDoUpdate({ target: [chatUsage.day, chatUsage.key], set: { count: 999 } });
  const cap = await customerSays(phone, "hi again");
  check("daily limit: no reply", (await agentReply(first.contactId, cap.messageId, { waitMs: 0, chat: fakeAi([() => ({ text: "x" })]) })).reason === "daily_cap");
  await db.update(waMessages).set({ createdAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(waMessages.contactId, first.contactId));
  await setBot({ waBotDailyCap: 200 });
  await db.delete(chatUsage).where(eq(chatUsage.key, "wa_bot"));
  check("24-hour window closed: no reply", (await agentReply(first.contactId, null, { waitMs: 0, chat: fakeAi([() => ({ text: "x" })]) })).reason === "window_closed");
  const failing = await customerSays(phone, "ok");
  const r6 = await agentReply(first.contactId, failing.messageId, { waitMs: 0, chat: async () => { throw new Error("overloaded"); } });
  check("AI error: nothing sent, staff told", r6.status === "failed" && (await db.select().from(notifications).where(eq(notifications.userId, staff.id))).some((n) => n.kind === "wa_bot_failed"));
} finally {
  globalThis.fetch = realFetch;
  if (made.contacts.length) {
    await db.delete(notifications).where(inArray(notifications.href, made.contacts.map((id) => `/admin/whatsapp/${id}`)));
    await db.delete(activities).where(inArray(activities.contactId, made.contacts));
    await db.delete(waBot).where(inArray(waBot.contactId, made.contacts));
    await db.delete(waMessages).where(inArray(waMessages.contactId, made.contacts));
    await db.delete(contacts).where(inArray(contacts.id, made.contacts));
  }
  if (made.users.length) {
    await db.delete(notifications).where(inArray(notifications.userId, made.users));
    await db.delete(users).where(inArray(users.id, made.users));
  }
  if (made.properties.length) {
    await db.delete(images).where(inArray(images.ownerId, made.properties));
    await db.delete(properties).where(inArray(properties.id, made.properties));
  }
  await db.delete(areas).where(like(areas.slug, `${tag}-%`));
  await db.delete(settings).where(inArray(settings.key, ["waBotEnabled", "waBotMode", "waBotHours", "waBotDailyCap", "waBotDelay", "waBotModel", "waBotInstructions", "waBotAvoid"]));
  await db.delete(chatUsage).where(eq(chatUsage.key, "wa_bot"));
  await removeIntegration("whatsapp");
  await removeIntegration("openrouter");
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll WhatsApp agent checks passed");
  process.exit(failures ? 1 : 0);
}
