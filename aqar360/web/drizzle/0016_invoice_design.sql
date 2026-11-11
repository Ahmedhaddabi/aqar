ALTER TABLE "invoices" ADD COLUMN "subtotal" numeric(14, 3) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount" numeric(14, 3) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "vat_rate" numeric(5, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "vat_total" numeric(14, 3) DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Invoices made before VAT and discounts: subtotal = total.
UPDATE "invoices" SET "subtotal" = "total" WHERE "subtotal" = 0;