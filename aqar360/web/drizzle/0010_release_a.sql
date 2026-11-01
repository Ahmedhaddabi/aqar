CREATE SEQUENCE "public"."agreement_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "agreements" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"contact_id" integer NOT NULL,
	"request_id" integer,
	"property_id" integer,
	"template" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"body_hash" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"signer_name" text,
	"signature" text,
	"signer_ip_hash" text,
	"signer_agent" text,
	"decline_reason" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreements_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "chat_usage" (
	"day" date NOT NULL,
	"key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chat_usage_day_key_pk" PRIMARY KEY("day","key")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"ref" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"publish" boolean DEFAULT false NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "id_number" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "nationality" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "id_expiry" date;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "referred_by" integer;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agreements_contact_idx" ON "agreements" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "reviews_contact_idx" ON "reviews" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_contact_ref_idx" ON "reviews" USING btree ("contact_id","ref");--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_referred_by_contacts_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_referral_code_unique" UNIQUE("referral_code");