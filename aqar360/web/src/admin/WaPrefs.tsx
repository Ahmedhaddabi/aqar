// What a customer told the WhatsApp agent they want (saved as the chat goes), shown in the chat and on the customer's file.
import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { areas } from "@/db/schema";
import { botState } from "@/lib/wa-agent";

import { adminDict } from "./i18n";

export async function WaPrefs({ contactId, lang, state }: { contactId: number; lang: "ar" | "en"; state?: Awaited<ReturnType<typeof botState>> }) {
  const t = adminDict(lang).wa;
  const s = state ?? (await botState(contactId));
  const prefs = s.preferences;
  const prefAreas = prefs.areaIds?.length ? await db.select().from(areas).where(inArray(areas.id, prefs.areaIds)) : [];
  if (Object.keys(prefs).length === 0) return <p className="a-muted">{t.prefNone}</p>;
  return (
    <dl className="wa-prefs">
      {prefs.purpose && <><dt>{prefs.purpose === "rent" ? t.rent : t.buy}</dt><dd>{prefs.kind ?? "—"}</dd></>}
      {(prefs.budgetMin || prefs.budgetMax) && <><dt>{t.budget}</dt><dd dir="ltr">{[prefs.budgetMin, prefs.budgetMax].filter(Boolean).map((v) => v!.toLocaleString("en")).join(" – ")} OMR</dd></>}
      {prefs.bedrooms && <><dt>{t.bedrooms}</dt><dd>{prefs.bedrooms}</dd></>}
      {prefAreas.length > 0 && <><dt>{t.areas}</dt><dd>{prefAreas.map((a) => (lang === "ar" ? a.nameAr : a.nameEn)).join("، ")}</dd></>}
      {prefs.notes && <><dt>{t.notes}</dt><dd dir="auto">{prefs.notes}</dd></>}
      {s.language && <><dt>{t.language}</dt><dd>{s.language === "ar" ? "العربية" : "English"}</dd></>}
    </dl>
  );
}
