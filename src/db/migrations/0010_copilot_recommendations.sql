CREATE TABLE "ad_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"campaign_id" text,
	"before" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"after" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"revert_of" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"campaign_id" text,
	"title" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requires_approval" boolean NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"applied_by" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ad_actions" ADD CONSTRAINT "ad_actions_recommendation_id_ad_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."ad_recommendations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_actions_campaign_idx" ON "ad_actions" USING btree ("campaign_id","at");--> statement-breakpoint
CREATE INDEX "ad_recommendations_status_idx" ON "ad_recommendations" USING btree ("status","created_at");