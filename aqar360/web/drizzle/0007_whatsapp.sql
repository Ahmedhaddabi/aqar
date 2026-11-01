CREATE TABLE "wa_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer,
	"direction" text NOT NULL,
	"wa_id" text,
	"phone" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"error" text,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_messages_wa_id_unique" UNIQUE("wa_id")
);
--> statement-breakpoint
CREATE TABLE "wa_templates" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"params" text[] DEFAULT '{}'::text[] NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wa_messages_contact_idx" ON "wa_messages" USING btree ("contact_id");