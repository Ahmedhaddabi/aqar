CREATE SEQUENCE "public"."request_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer,
	"contact_id" integer NOT NULL,
	"user_id" integer,
	"type" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"due_at" timestamp with time zone,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"purpose" text NOT NULL,
	"channel" text NOT NULL,
	"granted" boolean NOT NULL,
	"source" text NOT NULL,
	"evidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"language" text DEFAULT 'ar' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"subtype" text,
	"status" text DEFAULT 'new' NOT NULL,
	"contact_id" integer NOT NULL,
	"assigned_to" integer,
	"property_type" text,
	"area_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"budget_min" numeric(14, 3),
	"budget_max" numeric(14, 3),
	"bedrooms_min" integer,
	"timing" text,
	"notes" text DEFAULT '' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"preferred_channel" text,
	"language" text DEFAULT 'ar' NOT NULL,
	"interest_project_id" integer,
	"interest_property_id" integer,
	"source_channel" text,
	"source_page" text,
	"attribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"alerts_paused" boolean DEFAULT false NOT NULL,
	"expires_on" date,
	"first_response_at" timestamp with time zone,
	"closed_reason" text,
	"self_token_hash" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_number_unique" UNIQUE("number"),
	CONSTRAINT "requests_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_interest_project_id_projects_id_fk" FOREIGN KEY ("interest_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_interest_property_id_properties_id_fk" FOREIGN KEY ("interest_property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_request_idx" ON "activities" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "activities_contact_idx" ON "activities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "activities_due_idx" ON "activities" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "consents_contact_idx" ON "consents" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contacts_phone_idx" ON "contacts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requests_contact_idx" ON "requests" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "requests_assigned_idx" ON "requests" USING btree ("assigned_to");