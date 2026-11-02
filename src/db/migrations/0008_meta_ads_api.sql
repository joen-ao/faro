ALTER TABLE "ad_spend" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_spend" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "ad_spend" ADD COLUMN "spend_local" double precision;--> statement-breakpoint
ALTER TABLE "ad_spend" ADD COLUMN "fx" double precision;--> statement-breakpoint
ALTER TABLE "ad_spend" ADD COLUMN "conversations" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_spend" ADD COLUMN "campaign_name" text;