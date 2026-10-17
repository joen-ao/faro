import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ---------- enums (SPEC §4, §6) ---------- */
export const sourceChannelEnum = pgEnum("source_channel", [
  "osm",
  "rues",
  "reps",
  "google_places",
  "website",
  "meta_ads",
  "sample",
]);
export const contactChannelEnum = pgEnum("contact_channel", ["email", "web_form", "whatsapp", "dapta_widget"]);
export const contactPointTypeEnum = pgEnum("contact_point_type", ["email", "phone", "whatsapp", "web_form"]);
export const huntStatusEnum = pgEnum("hunt_status", ["pending", "running", "paused", "completed", "failed"]);
export const leadStatusEnum = pgEnum("lead_status", [
  "found",
  "fit",
  "contacted",
  "responded",
  "qualified",
  "disqualified",
  "opted_out",
]);
export const messageStatusEnum = pgEnum("message_status", [
  "draft",
  "queued",
  "sent",
  "delivered",
  "failed",
  "blocked",
  /** SEND_ENABLED=false: the pipeline ran but nothing left (or an assisted send done as practice). */
  "simulated",
  /** Claimed by a worker (atomic queued -> sending). Stays here if the process dies after calling the provider: manual review. */
  "sending",
]);
export const eventTypeEnum = pgEnum("event_type", [
  "sent",
  "delivered",
  "click",
  "reply",
  "widget_open",
  "widget_chat",
  "form_submit",
  "qualified",
  "disqualified",
  "opt_out",
]);
export const qualificationOriginEnum = pgEnum("qualification_origin", ["dapta", "fallback"]);
export const costCategoryEnum = pgEnum("cost_category", [
  "data",
  "ai",
  "scraping",
  "email",
  "whatsapp",
  "dapta",
  "ads",
  "human",
]);
export const suppressionKindEnum = pgEnum("suppression_kind", ["domain", "email", "phone"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const usd = (name: string) => numeric(name, { precision: 14, scale: 6, mode: "number" });

/* ---------- tables ---------- */
export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  offerDescription: text("offer_description"),
  senderName: text("sender_name"),
  senderEmail: text("sender_email"),
  country: text("country").notNull().default("CO"),
  createdAt: createdAt(),
});

export const icpProfiles = pgTable("icp_profiles", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  /** sector, CIIU[], tags OSM[], tipos Places[], ciudad, bbox, tamaño, señales[], exclusiones[] */
  criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull().default({}),
  threshold: integer("threshold").notNull().default(60),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
});

export const hunts = pgTable("hunts", {
  id: id(),
  icpProfileId: uuid("icp_profile_id").notNull().references(() => icpProfiles.id, { onDelete: "cascade" }),
  status: huntStatusEnum("status").notNull().default("pending"),
  progress: jsonb("progress").$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const companies = pgTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    nit: text("nit"),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    city: text("city"),
    website: text("website"),
    isLegalEntity: boolean("is_legal_entity").notNull().default(true),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("companies_nit_idx").on(t.nit),
    index("companies_normalized_name_idx").on(t.normalizedName),
    index("companies_is_demo_idx").on(t.isDemo),
  ],
);

export const companySources = pgTable(
  "company_sources",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    sourceChannel: sourceChannelEnum("source_channel").notNull(),
    externalId: text("external_id").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    sourceUrl: text("source_url"),
    license: text("license"),
    isMock: boolean("is_mock").notNull().default(false),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("company_sources_channel_external_uq").on(t.sourceChannel, t.externalId),
    index("company_sources_company_idx").on(t.companyId),
  ],
);

export const contactPoints = pgTable(
  "contact_points",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    type: contactPointTypeEnum("type").notNull(),
    value: text("value").notNull(),
    isGeneric: boolean("is_generic").notNull().default(false),
    sourceChannel: sourceChannelEnum("source_channel"),
    evidenceUrl: text("evidence_url"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("contact_points_company_type_value_uq").on(t.companyId, t.type, t.value)],
);

export const fitAssessments = pgTable(
  "fit_assessments",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    icpProfileId: uuid("icp_profile_id").notNull().references(() => icpProfiles.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    /** criterios cumplidos con evidencia y URL */
    criteriaMet: jsonb("criteria_met").$type<unknown[]>().notNull().default([]),
    whyNow: text("why_now"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("fit_assessments_company_idx").on(t.companyId, t.icpProfileId)],
);

export const leads = pgTable(
  "leads",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    huntId: uuid("hunt_id").references(() => hunts.id, { onDelete: "set null" }),
    status: leadStatusEnum("status").notNull().default("found"),
    primarySource: sourceChannelEnum("primary_source").notNull(),
    fitScore: integer("fit_score"),
    slug: text("slug").notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("leads_slug_uq").on(t.slug),
    uniqueIndex("leads_company_hunt_uq").on(t.companyId, t.huntId),
    index("leads_status_idx").on(t.status),
    index("leads_hunt_idx").on(t.huntId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    contactChannel: contactChannelEnum("contact_channel").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    status: messageStatusEnum("status").notNull().default("draft"),
    providerId: text("provider_id"),
    /** Address / form URL the message goes to (resolved at enqueue time). */
    recipient: text("recipient"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    blockedByRule: text("blocked_by_rule"),
    isMock: boolean("is_mock").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("messages_lead_idx").on(t.leadId)],
);

export const events = pgTable(
  "events",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    type: eventTypeEnum("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    utm: jsonb("utm").$type<Record<string, string>>(),
    isDemo: boolean("is_demo").notNull().default(false),
    isMock: boolean("is_mock").notNull().default(false),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("events_lead_type_idx").on(t.leadId, t.type)],
);

export const qualifications = pgTable(
  "qualifications",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    origin: qualificationOriginEnum("origin").notNull(),
    qualified: boolean("qualified").notNull(),
    score: integer("score"),
    /** campos BANT */
    bant: jsonb("bant").$type<Record<string, unknown>>().notNull().default({}),
    summary: text("summary"),
    conversationId: text("conversation_id"),
    creditsUsed: integer("credits_used").notNull().default(0),
    isDemo: boolean("is_demo").notNull().default(false),
    /** `fallback` origin is always mock-grade: never counts as real Dapta qualification. */
    isMock: boolean("is_mock").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("qualifications_lead_idx").on(t.leadId)],
);

export const costEntries = pgTable(
  "cost_entries",
  {
    id: id(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    huntId: uuid("hunt_id").references(() => hunts.id, { onDelete: "set null" }),
    sourceChannel: sourceChannelEnum("source_channel"),
    contactChannel: contactChannelEnum("contact_channel"),
    category: costCategoryEnum("category").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 6, mode: "number" }).notNull().default(0),
    unit: text("unit").notNull(),
    rate: usd("rate").notNull().default(0),
    usd: usd("usd").notNull().default(0),
    evidence: text("evidence"),
    isDemo: boolean("is_demo").notNull().default(false),
    isMock: boolean("is_mock").notNull().default(false),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("cost_entries_lead_idx").on(t.leadId),
    index("cost_entries_hunt_idx").on(t.huntId),
    index("cost_entries_category_idx").on(t.category),
  ],
);

export const costRates = pgTable(
  "cost_rates",
  {
    id: id(),
    key: text("key").notNull(),
    category: costCategoryEnum("category").notNull(),
    unit: text("unit").notNull(),
    usd: usd("usd").notNull(),
    description: text("description"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("cost_rates_key_uq").on(t.key)],
);

export const adSpend = pgTable(
  "ad_spend",
  {
    id: id(),
    platform: text("platform").notNull(),
    campaign: text("campaign").notNull(),
    date: text("date").notNull(), // ISO yyyy-mm-dd
    usd: usd("usd").notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ad_spend_platform_campaign_date_demo_uq").on(t.platform, t.campaign, t.date, t.isDemo)],
);

export const suppression = pgTable(
  "suppression",
  {
    id: id(),
    kind: suppressionKindEnum("kind").notNull(),
    /** lowercase domain, email or E.164 phone */
    value: text("value").notNull(),
    reason: text("reason").notNull(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("suppression_value_uq").on(t.value)],
);

export const apiCalls = pgTable(
  "api_calls",
  {
    id: id(),
    service: text("service").notNull(),
    endpoint: text("endpoint"),
    huntId: uuid("hunt_id").references(() => hunts.id, { onDelete: "set null" }),
    status: integer("status"),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    costUsd: usd("cost_usd").notNull().default(0),
    isMock: boolean("is_mock").notNull().default(false),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("api_calls_service_idx").on(t.service, t.at)],
);

