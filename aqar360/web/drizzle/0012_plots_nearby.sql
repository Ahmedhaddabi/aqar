CREATE TABLE "nearby_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plots" (
	"id" serial PRIMARY KEY NOT NULL,
	"property_id" integer,
	"plot_number" text,
	"block" text,
	"location" text,
	"land_use" text,
	"stated_area_sqm" double precision,
	"crs" text DEFAULT 'wgs84_utm40' NOT NULL,
	"points" jsonb NOT NULL,
	"polygon" jsonb NOT NULL,
	"center_lat" double precision NOT NULL,
	"center_lng" double precision NOT NULL,
	"area_sqm" double precision NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"document_id" integer,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plots_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
ALTER TABLE "plots" ADD CONSTRAINT "plots_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plots" ADD CONSTRAINT "plots_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plots" ADD CONSTRAINT "plots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;