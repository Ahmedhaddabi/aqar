CREATE TABLE "commission_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"month" text NOT NULL,
	"amount" numeric(14, 3) NOT NULL,
	"paid_on" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "area_ids" integer[] DEFAULT '{}'::int[] NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "calendar_key" text;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commission_payouts_user_idx" ON "commission_payouts" USING btree ("user_id","month");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_calendar_key_unique" UNIQUE("calendar_key");