// How quotes and invoices look, set by an admin in ERP → Invoice design. Stored in the settings table (no migration needed).
import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { settings } from "@/db/schema";

export const DESIGN_KEYS = ["invoiceLogoUrl", "invoiceStampUrl", "invoiceColor", "invoiceTemplate", "invoiceTermsEn", "invoiceTermsAr",
  "invoiceFooterEn", "invoiceFooterAr", "vatEnabled", "vatRate", "invoiceDueDays", "quoteValidDays", "invoiceShowQr",
  "invoiceShowWords"] as const;

export const TEMPLATES = ["band", "classic", "minimal"] as const;
export type InvoiceTemplate = (typeof TEMPLATES)[number];
export const DEFAULT_COLOR = "#1020F0";

export type InvoiceDesign = {
  logoUrl: string; stampUrl: string; color: string; template: InvoiceTemplate; termsEn: string; termsAr: string; footerEn: string;
  footerAr: string; vatEnabled: boolean; vatRate: number; dueDays: number; quoteValidDays: number; showQr: boolean; showWords: boolean;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function invoiceDesign(): Promise<InvoiceDesign> {
  const rows = await db.select().from(settings).where(inArray(settings.key, [...DESIGN_KEYS]));
  const v = (k: (typeof DESIGN_KEYS)[number]) => rows.find((r) => r.key === k)?.value;
  const str = (k: (typeof DESIGN_KEYS)[number]) => String(v(k) ?? "").trim();
  const num = (k: (typeof DESIGN_KEYS)[number], fallback: number) => (Number.isFinite(Number(v(k))) && v(k) !== "" && v(k) != null ? Number(v(k)) : fallback);
  const template = str("invoiceTemplate") as InvoiceTemplate;
  return {
    logoUrl: str("invoiceLogoUrl"), stampUrl: str("invoiceStampUrl"),
    color: HEX.test(str("invoiceColor")) ? str("invoiceColor") : DEFAULT_COLOR,
    template: TEMPLATES.includes(template) ? template : "band",
    termsEn: str("invoiceTermsEn"), termsAr: str("invoiceTermsAr"), footerEn: str("invoiceFooterEn"), footerAr: str("invoiceFooterAr"),
    vatEnabled: v("vatEnabled") === true, vatRate: num("vatRate", 5), dueDays: num("invoiceDueDays", 7), quoteValidDays: num("quoteValidDays", 30),
    showQr: v("invoiceShowQr") !== false, showWords: v("invoiceShowWords") !== false,
  };
}

/** The VAT rate a new invoice gets (percent), or 0 when VAT is off. */
export const defaultVatRate = (d: InvoiceDesign) => (d.vatEnabled ? d.vatRate : 0);

/** QR code (data: URL) for the customer's signed online copy of a quote or invoice, where they can also pay. */
export async function docQr(invoiceId: number) {
  const { default: QRCode } = await import("qrcode");
  const { docLink } = await import("./doc-link");
  return QRCode.toDataURL(docLink(invoiceId), { margin: 1, width: 224, errorCorrectionLevel: "M" }).catch(() => null);
}
