CREATE TYPE "public"."wa_author" AS ENUM('contacto', 'agente', 'persona');--> statement-breakpoint
CREATE TYPE "public"."wa_conversation_status" AS ENUM('abierta', 'humano', 'cerrada');--> statement-breakpoint
CREATE TYPE "public"."wa_direction" AS ENUM('in', 'out');--> statement-breakpoint
ALTER TYPE "public"."qualification_origin" ADD VALUE IF NOT EXISTS 'wa_agent';--> statement-breakpoint
CREATE TABLE "wa_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wa_agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wa_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"contact_name" text,
	"lead_id" uuid,
	"status" "wa_conversation_status" DEFAULT 'abierta' NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ad_id" text,
	"last_inbound_at" timestamp with time zone,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "wa_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wa_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "wa_direction" NOT NULL,
	"author" "wa_author" NOT NULL,
	"wamid" text,
	"kind" text DEFAULT 'text' NOT NULL,
	"text" text,
	"status" text DEFAULT 'received' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(14, 6) DEFAULT 0 NOT NULL,
	"model" text,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wa_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_agent_id_wa_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."wa_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wa_agents_phone_number_uq" ON "wa_agents" USING btree ("phone_number_id");--> statement-breakpoint
CREATE INDEX "wa_conversations_phone_idx" ON "wa_conversations" USING btree ("agent_id","phone","created_at");--> statement-breakpoint
CREATE INDEX "wa_conversations_status_idx" ON "wa_conversations" USING btree ("status","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_messages_wamid_uq" ON "wa_messages" USING btree ("wamid");--> statement-breakpoint
CREATE INDEX "wa_messages_conversation_idx" ON "wa_messages" USING btree ("conversation_id","created_at");