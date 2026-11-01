CREATE TABLE "property_views" (
	"property_id" integer NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "property_views_property_id_day_pk" PRIMARY KEY("property_id","day")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "receives_requests" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "property_views" ADD CONSTRAINT "property_views_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;