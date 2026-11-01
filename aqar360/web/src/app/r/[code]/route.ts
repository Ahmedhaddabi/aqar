import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { contacts } from "@/db/schema";

/** "Invite a friend": /r/CODE opens the search form with the code in the website's own attribution (utm_campaign=ref-CODE). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  const lang = (request.headers.get("accept-language") ?? "").toLowerCase().startsWith("en") ? "en" : "ar";
  const [known] = /^[A-Z0-9]{4,12}$/.test(code) ? await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.referralCode, code)) : [];
  const target = new URL(`/${lang}/find-me-a-property`, request.url);
  if (known) for (const [k, v] of [["utm_source", "referral"], ["utm_medium", "customer"], ["utm_campaign", `ref-${code}`]]) target.searchParams.set(k, v);
  return NextResponse.redirect(target, 307);
}
