CREATE TABLE "online_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"provider" text NOT NULL,
	"reference" text NOT NULL,
	"provider_ref" text,
	"amount" numeric(14, 3) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"checkout_url" text,
	"transaction_id" text,
	"live" boolean DEFAULT false NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "online_payments_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "online_payments_invoice_idx" ON "online_payments" USING btree ("invoice_id");