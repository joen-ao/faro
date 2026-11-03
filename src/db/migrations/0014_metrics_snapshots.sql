CREATE TABLE "metrics_snapshots" (
	"key" text NOT NULL,
	"range_days" integer NOT NULL,
	"data" jsonb NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metrics_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_snapshots_key_range_uq" ON "metrics_snapshots" USING btree ("key","range_days");