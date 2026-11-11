"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { TEMPLATES } from "@/lib/invoice-design";
import { uploadImage } from "@/lib/storage";

const PAGE = "/admin/invoice-design";

/** Saves how quotes and invoices look. Logo and stamp are optional uploads; "remove" clears them. Admins and managers. */
export async function saveInvoiceDesign(form: FormData) {
  const user = await requireUser(["admin", "manager"]);
  const parsed = z.object({
    invoiceColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), invoiceTemplate: z.enum(TEMPLATES),
    invoiceTermsEn: z.string().trim().max(1500).default(""), invoiceTermsAr: z.string().trim().max(1500).default(""),
    invoiceFooterEn: z.string().trim().max(300).default(""), invoiceFooterAr: z.string().trim().max(300).default(""),
    vatRate: z.coerce.number().min(0).max(100), invoiceDueDays: z.coerce.number().int().min(0).max(365),
    quoteValidDays: z.coerce.number().int().min(1).max(365),
  }).safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) redirect(`${PAGE}?error=invalid`);
  const rows: { key: string; value: unknown }[] = Object.entries(parsed.data).map(([key, value]) => ({ key, value }));
  rows.push({ key: "vatEnabled", value: form.get("vatEnabled") === "on" }, { key: "invoiceShowQr", value: form.get("invoiceShowQr") === "on" },
    { key: "invoiceShowWords", value: form.get("invoiceShowWords") === "on" });
  for (const [field, key] of [["logo", "invoiceLogoUrl"], ["stamp", "invoiceStampUrl"]] as const) {
    const file = form.get(field);
    if (file instanceof File && file.size > 0) {
      const up = await uploadImage(file, "brand");
      if (!up.ok) redirect(`${PAGE}?error=upload`);
      rows.push({ key, value: up.url });
    } else if (form.get(`${field}Remove`) === "on") rows.push({ key, value: "" });
  }
  await db.insert(settings).values(rows).onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value` } });
  await audit("invoice_design_saved", "settings", null, { keys: rows.map((r) => r.key) }, user.id);
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=1`);
}

