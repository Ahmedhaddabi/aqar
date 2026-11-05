import { NextResponse } from "next/server";

import { runAgent } from "@/lib/agent";

export const maxDuration = 300;

/** Vercel Cron (vercel.json), once a day with "Authorization: Bearer <CRON_SECRET>": reads the web and compares. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await runAgent("daily")) });
}
