// How customers can pay: manual methods with the bank details printed on invoices, plus the online gateways.
import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { settings } from "@/db/schema";

export const PAY_KEYS = ["payBank", "bankName", "bankAccountName", "bankAccountNumber", "bankIban", "bankSwift", "payCash", "payCheque",
  "chequePayee", "payCard", "payNoteEn", "payNoteAr", "payThawani", "payPaymob"] as const;

export type PayMethods = { bank: boolean; bankName: string; accountName: string; accountNumber: string; iban: string; swift: string;
  cash: boolean; cheque: boolean; chequePayee: string; card: boolean; noteEn: string; noteAr: string; thawani: boolean; paymob: boolean };

export async function payMethods(): Promise<PayMethods> {
  const rows = await db.select().from(settings).where(inArray(settings.key, [...PAY_KEYS]));
  const v = (k: string) => rows.find((r) => r.key === k)?.value;
  const str = (k: string) => String(v(k) ?? "").trim();
  return { bank: v("payBank") !== false, bankName: str("bankName"), accountName: str("bankAccountName"), accountNumber: str("bankAccountNumber"),
    iban: str("bankIban"), swift: str("bankSwift"), cash: v("payCash") !== false, cheque: v("payCheque") === true, chequePayee: str("chequePayee"),
    card: v("payCard") === true, noteEn: str("payNoteEn"), noteAr: str("payNoteAr"), thawani: v("payThawani") !== false, paymob: v("payPaymob") !== false };
}
