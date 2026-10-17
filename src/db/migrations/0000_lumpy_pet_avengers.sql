CREATE TYPE "public"."contact_channel" AS ENUM('email', 'web_form', 'whatsapp', 'dapta_widget');--> statement-breakpoint
CREATE TYPE "public"."contact_point_type" AS ENUM('email', 'phone', 'whatsapp', 'web_form');--> statement-breakpoint
CREATE TYPE "public"."cost_category" AS ENUM('data', 'ai', 'scraping', 'email', 'whatsapp', 'dapta', 'ads', 'human');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('sent', 'delivered', 'click', 'reply', 'widget_open', 'widget_chat', 'form_submit', 'qualified', 'disqualified', 'opt_out');--> statement-breakpoint
CREATE TYPE "public"."hunt_status" AS ENUM('pending', 'running', 'paused', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('found', 'fit', 'contacted', 'responded', 'qualified', 'disqualified', 'opted_out');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('draft', 'queued', 'sent', 'delivered', 'failed', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."qualification_origin" AS ENUM('dapta', 'fallback');--> statement-breakpoint
CREATE TYPE "public"."source_channel" AS ENUM('osm', 'rues', 'reps', 'google_places', 'website', 'meta_ads', 'sample');--> statement-breakpoint
CREATE TYPE "public"."suppression_kind" AS ENUM('domain', 'email', 'phone');--> statement-breakpoint
CREATE TABLE "ad_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"campaign" text NOT NULL,
	"date" text NOT NULL,
	"usd" numeric(14, 6) NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"endpoint" text,
	"hunt_id" uuid,
	"status" integer,
	"latency_ms" integer,
	"error" text,
	"cost_usd" numeric(14, 6) DEFAULT 0 NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"nit" text,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"city" text,
	"website" text,
	"is_legal_entity" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_channel" "source_channel" NOT NULL,
	"external_id" text NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_url" text,
	"license" text,
	"is_mock" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "contact_point_type" NOT NULL,
	"value" text NOT NULL,
	"is_generic" boolean DEFAULT false NOT NULL,
	"source_channel" "source_channel",
	"evidence_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"hunt_id" uuid,
	"source_channel" "source_channel",
	"contact_channel" "contact_channel",
	"category" "cost_category" NOT NULL,
	"quantity" numeric(18, 6) DEFAULT 0 NOT NULL,
	"unit" text NOT NULL,
	"rate" numeric(14, 6) DEFAULT 0 NOT NULL,
	"usd" numeric(14, 6) DEFAULT 0 NOT NULL,
	"evidence" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"category" "cost_category" NOT NULL,
	"unit" text NOT NULL,
	"usd" numeric(14, 6) NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" "event_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"utm" jsonb,
	"is_demo" boolean DEFAULT false NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fit_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"icp_profile_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"criteria_met" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"why_now" text,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hunts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"icp_profile_id" uuid NOT NULL,
	"status" "hunt_status" DEFAULT 'pending' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "icp_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"threshold" integer DEFAULT 60 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"hunt_id" uuid,
	"status" "lead_status" DEFAULT 'found' NOT NULL,
	"primary_source" "source_channel" NOT NULL,
	"fit_score" integer,
	"slug" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"contact_channel" "contact_channel" NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" "message_status" DEFAULT 'draft' NOT NULL,
	"provider_id" text,
	"sent_at" timestamp with time zone,
	"blocked_by_rule" text,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"origin" "qualification_origin" NOT NULL,
	"qualified" boolean NOT NULL,
	"score" integer,
	"bant" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"conversation_id" text,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "suppression_kind" NOT NULL,
	"value" text NOT NULL,
	"reason" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"offer_description" text,
	"sender_name" text,
	"sender_email" text,
	"country" text DEFAULT 'CO' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_calls" ADD CONSTRAINT "api_calls_hunt_id_hunts_id_fk" FOREIGN KEY ("hunt_id") REFERENCES "public"."hunts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_sources" ADD CONSTRAINT "company_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_points" ADD CONSTRAINT "contact_points_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_hunt_id_hunts_id_fk" FOREIGN KEY ("hunt_id") REFERENCES "public"."hunts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fit_assessments" ADD CONSTRAINT "fit_assessments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fit_assessments" ADD CONSTRAINT "fit_assessments_icp_profile_id_icp_profiles_id_fk" FOREIGN KEY ("icp_profile_id") REFERENCES "public"."icp_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hunts" ADD CONSTRAINT "hunts_icp_profile_id_icp_profiles_id_fk" FOREIGN KEY ("icp_profile_id") REFERENCES "public"."icp_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "icp_profiles" ADD CONSTRAINT "icp_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_hunt_id_hunts_id_fk" FOREIGN KEY ("hunt_id") REFERENCES "public"."hunts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_spend_platform_campaign_date_uq" ON "ad_spend" USING btree ("platform","campaign","date");--> statement-breakpoint
CREATE INDEX "api_calls_service_idx" ON "api_calls" USING btree ("service","at");--> statement-breakpoint
CREATE INDEX "companies_nit_idx" ON "companies" USING btree ("nit");--> statement-breakpoint
CREATE INDEX "companies_normalized_name_idx" ON "companies" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "companies_is_demo_idx" ON "companies" USING btree ("is_demo");--> statement-breakpoint
CREATE UNIQUE INDEX "company_sources_channel_external_uq" ON "company_sources" USING btree ("source_channel","external_id");--> statement-breakpoint
CREATE INDEX "company_sources_company_idx" ON "company_sources" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_points_company_type_value_uq" ON "contact_points" USING btree ("company_id","type","value");--> statement-breakpoint
CREATE INDEX "cost_entries_lead_idx" ON "cost_entries" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "cost_entries_hunt_idx" ON "cost_entries" USING btree ("hunt_id");--> statement-breakpoint
CREATE INDEX "cost_entries_category_idx" ON "cost_entries" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_rates_key_uq" ON "cost_rates" USING btree ("key");--> statement-breakpoint
CREATE INDEX "events_lead_type_idx" ON "events" USING btree ("lead_id","type");--> statement-breakpoint
CREATE INDEX "fit_assessments_company_idx" ON "fit_assessments" USING btree ("company_id","icp_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_slug_uq" ON "leads" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_company_hunt_uq" ON "leads" USING btree ("company_id","hunt_id");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_hunt_idx" ON "leads" USING btree ("hunt_id");--> statement-breakpoint
CREATE INDEX "messages_lead_idx" ON "messages" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "qualifications_lead_idx" ON "qualifications" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_value_uq" ON "suppression" USING btree ("value");