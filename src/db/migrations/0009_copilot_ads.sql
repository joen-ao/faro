CREATE TABLE "ad_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" text NOT NULL,
	"ad_name" text,
	"campaign_id" text NOT NULL,
	"date" text NOT NULL,
	"currency" text NOT NULL,
	"spend_local" double precision DEFAULT 0 NOT NULL,
	"usd" double precision DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"link_clicks" integer DEFAULT 0 NOT NULL,
	"frequency" double precision DEFAULT 0 NOT NULL,
	"conversations" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"brief_id" text NOT NULL,
	"angle" text NOT NULL,
	"format_hint" text NOT NULL,
	"hook" text NOT NULL,
	"primary_text" text NOT NULL,
	"headline" text NOT NULL,
	"description" text,
	"cta" text NOT NULL,
	"hypothesis" text NOT NULL,
	"brief" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ad_insights_ad_date_uq" ON "ad_insights" USING btree ("ad_id","date");--> statement-breakpoint
CREATE INDEX "ad_insights_campaign_idx" ON "ad_insights" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_variants_ad_uq" ON "ad_variants" USING btree ("ad_id");