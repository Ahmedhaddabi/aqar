CREATE TABLE "areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"wilayat_id" integer,
	"lat" double precision,
	"lng" double precision,
	"boundary" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "areas_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" integer NOT NULL,
	"url" text NOT NULL,
	"caption_en" text,
	"caption_ar" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"title_ar" text NOT NULL,
	"title_en" text NOT NULL,
	"summary_ar" text DEFAULT '' NOT NULL,
	"summary_en" text DEFAULT '' NOT NULL,
	"body_ar" text DEFAULT '' NOT NULL,
	"body_en" text DEFAULT '' NOT NULL,
	"facts_ar" text DEFAULT '' NOT NULL,
	"facts_en" text DEFAULT '' NOT NULL,
	"faqs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources" text,
	"area_id" integer,
	"published" boolean DEFAULT false NOT NULL,
	"last_reviewed" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "project_unit_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"type" text NOT NULL,
	"bedrooms" integer,
	"size_from" double precision,
	"size_to" double precision,
	"price_from" numeric(14, 3),
	"price_to" numeric(14, 3),
	"available" integer,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text DEFAULT '' NOT NULL,
	"developer" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'Residential' NOT NULL,
	"area_id" integer,
	"lat" double precision,
	"lng" double precision,
	"construction_status" text,
	"handover" date,
	"price_from" numeric(14, 3),
	"price_to" numeric(14, 3),
	"payment_plan_en" text DEFAULT '' NOT NULL,
	"payment_plan_ar" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"description_ar" text DEFAULT '' NOT NULL,
	"foreign_ownership" boolean DEFAULT false NOT NULL,
	"availability" text DEFAULT 'active' NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"cover_image" text,
	"brochure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"purpose" text DEFAULT 'sale' NOT NULL,
	"sale_price" numeric(14, 3),
	"rent_price" numeric(14, 3),
	"bedrooms" integer,
	"bathrooms" integer,
	"size_sqm" double precision,
	"furnished" text,
	"area_id" integer,
	"project_id" integer,
	"unit_number" text,
	"floor" integer,
	"unit_type" text,
	"lat" double precision,
	"lng" double precision,
	"show_exact_location" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"owner_name" text,
	"owner_phone" text,
	"description_en" text DEFAULT '' NOT NULL,
	"description_ar" text DEFAULT '' NOT NULL,
	"cover_image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"scope_en" text DEFAULT '' NOT NULL,
	"scope_ar" text DEFAULT '' NOT NULL,
	"price" numeric(14, 3),
	"public" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "services_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'agent' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"language" text DEFAULT 'ar' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wilayats" (
	"id" serial PRIMARY KEY NOT NULL,
	"governorate_en" text NOT NULL,
	"governorate_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_wilayat_id_wilayats_id_fk" FOREIGN KEY ("wilayat_id") REFERENCES "public"."wilayats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_unit_types" ADD CONSTRAINT "project_unit_types_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "images_owner_idx" ON "images" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "properties_project_idx" ON "properties" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "properties_area_idx" ON "properties" USING btree ("area_id");