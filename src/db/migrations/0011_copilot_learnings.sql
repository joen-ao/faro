CREATE TABLE "ad_learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dimension" text NOT NULL,
	"metric" text NOT NULL,
	"winner" text NOT NULL,
	"statement" text NOT NULL,
	"confidence" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"status" text DEFAULT 'vigente' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ad_learnings_status_idx" ON "ad_learnings" USING btree ("status","created_at");