CREATE TABLE "targets" (
	"user_id" integer NOT NULL,
	"month" text NOT NULL,
	"won" integer,
	"viewings" integer,
	"income" numeric(14, 3),
	CONSTRAINT "targets_user_id_month_pk" PRIMARY KEY("user_id","month")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "commission_pct" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;