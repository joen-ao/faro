CREATE TABLE "rne_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"excluded" boolean NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rne_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "rne_checks_value_uq" ON "rne_checks" USING btree ("value");