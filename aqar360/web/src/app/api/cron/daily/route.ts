import { NextResponse } from "next/server";

import { reassignOverdue } from "@/lib/assign";
import { notifyLateJobs, notifyLateReplies } from "@/lib/jobs";
import { runDailyReminders } from "@/lib/messages";
import { warmNearby } from "@/lib/nearby";
import { sendWeeklyReport } from "@/lib/weekly";

/** Vercel Cron (vercel.json) calls this once a day with "Authorization: Bearer <CRON_SECRET>". */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, sent: await runDailyReminders(), lateJobs: await notifyLateJobs(), lateReplies: await notifyLateReplies(),
    reassigned: await reassignOverdue(), weeklyReport: await sendWeeklyReport(),
    nearby: await warmNearby().catch(() => null) });
}
