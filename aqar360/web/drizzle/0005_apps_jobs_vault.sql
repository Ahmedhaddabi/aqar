CREATE SEQUENCE "public"."job_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" integer NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"url" text NOT NULL,
	"mime" text DEFAULT '' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"uploaded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"spent_on" date NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(14, 3) NOT NULL,
	"description" text NOT NULL,
	"receipt_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" integer,
	"decided_at" timestamp with time zone,
	"decision_note" text DEFAULT '' NOT NULL,
	"reimbursed_on" date,
	"expense_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"user_id" integer,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"href" text,
	"key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "service_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"contact_id" integer NOT NULL,
	"request_id" integer,
	"invoice_id" integer,
	"property_id" integer,
	"service_code" text,
	"title" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"assigned_to" integer,
	"supplier_id" integer,
	"supplier_cost" numeric(14, 3),
	"scheduled_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"sla_hours" integer DEFAULT 48 NOT NULL,
	"paused_at" timestamp with time zone,
	"brief" jsonb,
	"brief_at" timestamp with time zone,
	"deliverables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revisions_allowed" integer DEFAULT 2 NOT NULL,
	"revisions_used" integer DEFAULT 0 NOT NULL,
	"approved_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_jobs_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "sla_hours" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "revisions" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "apps" text[] DEFAULT '{crm}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_service_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."service_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_supplier_id_applications_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "job_events_job_idx" ON "job_events" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "service_jobs_status_idx" ON "service_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "service_jobs_contact_idx" ON "service_jobs" USING btree ("contact_id");--> statement-breakpoint
UPDATE "users" SET "apps" = '{crm,erp,hr}' WHERE "role" IN ('admin', 'manager');--> statement-breakpoint
UPDATE "services" SET "sla_hours" = CASE "code"
  WHEN 'AQ-PHOTOS' THEN 24 WHEN 'AQ-FLOOR-PLAN' THEN 48 WHEN 'AQ-VIDEO-STANDARD' THEN 48 WHEN 'AQ-VIDEO-AI' THEN 72
  WHEN 'AQ-VIDEO-DRONE-AI' THEN 72 WHEN 'AQ-VIDEO-PRESENTER' THEN 72 WHEN 'AQ-VIDEO-LIFESTYLE' THEN 120 WHEN 'AQ-EXTRA-REVISION' THEN 24
  ELSE "sla_hours" END;
