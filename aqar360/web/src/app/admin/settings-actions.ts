"use server";

import { sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";

const textKeys = ["companyNameAr", "companyNameEn", "companyAddress", "companyPhone", "companyEmail", "companyCr", "companyVat",
  "contactPhone", "contactWhatsapp", "contactEmail", "googleReviewUrl", "instagramUrl", "facebookUrl", "threadsUrl"] as const;
const numberKeys = { firstResponseHours: [1, 72], followUpDays: [1, 90], requestValidDays: [7, 365], viewingStart: [0, 23], viewingEnd: [1, 24],
  viewingSlotMinutes: [15, 240], viewingNoticeHours: [0, 168], viewingDaysAhead: [1, 60], reassignHours: [0, 72],
  chatDailyCap: [10, 5000] } as const;

export async function saveSettings(form: FormData) {
  const user = await requireUser(["admin"]);
  const shape = Object.fromEntries([...textKeys.map((k) => [k, z.string().trim().max(300).default("")]),
    ...Object.entries(numberKeys).map(([k, [min, max]]) => [k, z.coerce.number().int().min(min).max(max)])]);
  const parsed = z.object(shape).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/admin/settings?error=1");
  const rows: { key: string; value: unknown }[] = Object.entries(parsed.data).map(([key, value]) => ({ key, value }));
  const days = [...new Set(form.getAll("viewingDays").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  rows.push({ key: "viewingDays", value: days.join(",") }, { key: "viewingSelfBooking", value: form.get("viewingSelfBooking") === "on" },
    { key: "assignAuto", value: form.get("assignAuto") === "on" }, { key: "chatEnabled", value: form.get("chatEnabled") === "on" });
  await db.insert(settings).values(rows).onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value` } });
  await audit("settings_saved", "settings", null, {}, user.id);
  revalidateTag("aqar-content");
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}
