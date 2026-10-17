ALTER TYPE "public"."message_status" ADD VALUE 'simulated';--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "recipient" text;