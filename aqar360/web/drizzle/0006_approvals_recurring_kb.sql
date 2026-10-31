CREATE TABLE "approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"invoice_id" integer,
	"amount" numeric(14, 3) NOT NULL,
	"reason" text NOT NULL,
	"method" text DEFAULT 'bank' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" integer NOT NULL,
	"decided_by" integer,
	"decided_at" timestamp with time zone,
	"decision_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'procedure' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"roles" text[] DEFAULT '{admin,manager,agent}'::text[] NOT NULL,
	"effective_from" date,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(14, 3) NOT NULL,
	"paid_from" text DEFAULT 'bank' NOT NULL,
	"every_months" integer DEFAULT 1 NOT NULL,
	"next_due" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "service_jobs" ADD COLUMN "price" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "service_jobs" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "service_jobs" ADD COLUMN "rating_note" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "contacts" SET "source" = 'Website' WHERE "source" IS NULL;
