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
  "secop",
  "rnt",
  "solidaria",
  "website",
  "meta_ads",
  "sample",
]);
export const contactChannelEnum = pgEnum("contact_channel", ["email", "web_form", "whatsapp", "dapta_widget"]);
export const contactPointTypeEnum = pgEnum("contact_point_type", ["email", "phone", "whatsapp", "web_form", "social"]);
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
  "meeting_booked",
  "purchase_intent",
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
}).enableRLS();

export const icpProfiles = pgTable("icp_profiles", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  /** sector, CIIU[], tags OSM[], tipos Places[], ciudad, bbox, tamaño, señales[], exclusiones[] */
  criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull().default({}),
  threshold: integer("threshold").notNull().default(60),
  /** What this hunt offers: chosen service ids, a snapshot of those services and the accepted value angles. Null on older hunts. */
  offer: jsonb("offer").$type<Record<string, unknown>>(),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
}).enableRLS();

export const hunts = pgTable("hunts", {
  id: id(),
  icpProfileId: uuid("icp_profile_id").notNull().references(() => icpProfiles.id, { onDelete: "cascade" }),
  status: huntStatusEnum("status").notNull().default("pending"),
  progress: jsonb("progress").$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: createdAt(),
}).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
    /** F28: 'manual' (form/CSV) or 'meta_api' (synced from the Marketing API). */
    source: text("source").notNull().default("manual"),
    /** F28: account currency and spend in it; `fx` = units of that currency per USD used for `usd`. */
    currency: text("currency"),
    spendLocal: doublePrecision("spend_local"),
    fx: doublePrecision("fx"),
    /** F28: messaging conversations started (Meta action), 0 when not applicable. */
    conversations: integer("conversations").notNull().default(0),
    campaignName: text("campaign_name"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ad_spend_platform_campaign_date_demo_uq").on(t.platform, t.campaign, t.date, t.isDemo)],
).enableRLS();

/** F29 · Ads created by the copilot: which concept/hypothesis each Meta ad carries (for learning by angle). */
export const adVariants = pgTable(
  "ad_variants",
  {
    id: id(),
    adId: text("ad_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    briefId: text("brief_id").notNull(),
    angle: text("angle").notNull(),
    formatHint: text("format_hint").notNull(),
    hook: text("hook").notNull(),
    primaryText: text("primary_text").notNull(),
    headline: text("headline").notNull(),
    description: text("description"),
    cta: text("cta").notNull(),
    hypothesis: text("hypothesis").notNull(),
    /** F32 · `image` (library hash), `video` (video id), `url` (image URL) or null (no media). */
    mediaType: text("media_type"),
    mediaRef: text("media_ref"),
    /** The brief that produced it (service, audience, destination, budget). */
    brief: jsonb("brief").$type<Record<string, unknown>>().notNull().default({}),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ad_variants_ad_uq").on(t.adId)],
).enableRLS();

/** F29 · Meta insights per ad and day (real API only; money in account currency + USD). */
export const adInsights = pgTable(
  "ad_insights",
  {
    id: id(),
    adId: text("ad_id").notNull(),
    adName: text("ad_name"),
    campaignId: text("campaign_id").notNull(),
    date: text("date").notNull(),
    currency: text("currency").notNull(),
    spendLocal: doublePrecision("spend_local").notNull().default(0),
    usd: doublePrecision("usd").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    linkClicks: integer("link_clicks").notNull().default(0),
    frequency: doublePrecision("frequency").notNull().default(0),
    conversations: integer("conversations").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ad_insights_ad_date_uq").on(t.adId, t.date), index("ad_insights_campaign_idx").on(t.campaignId)],
).enableRLS();

/** F29-B · What the rules engine proposes. `requires_approval` = it raises spend or changes strategy. */
export const adRecommendations = pgTable(
  "ad_recommendations",
  {
    id: id(),
    rule: text("rule").notNull(),
    /** 'pause_ad' | 'lower_budget' | 'raise_budget' | 'activate_campaign' | 'alert' */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    campaignId: text("campaign_id"),
    title: text("title").notNull(),
    /** Action parameters (e.g. adSetId, fromBudget, toBudget). */
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    /** Metrics, window and n that justified it. */
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    requiresApproval: boolean("requires_approval").notNull(),
    /** 'proposed' | 'applied' | 'dismissed' | 'expired' | 'failed' */
    status: text("status").notNull().default("proposed"),
    appliedBy: text("applied_by"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("ad_recommendations_status_idx").on(t.status, t.createdAt)],
).enableRLS();

/** F29-B · Audit log of every change the copilot (or a human through it) made in Meta. */
export const adActions = pgTable(
  "ad_actions",
  {
    id: id(),
    recommendationId: uuid("recommendation_id").references(() => adRecommendations.id, { onDelete: "set null" }),
    /** 'autopilot' | 'human' */
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    campaignId: text("campaign_id"),
    before: jsonb("before").$type<Record<string, unknown>>().notNull().default({}),
    after: jsonb("after").$type<Record<string, unknown>>().notNull().default({}),
    ok: boolean("ok").notNull(),
    error: text("error"),
    revertOf: uuid("revert_of"),
    isDemo: boolean("is_demo").notNull().default(false),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ad_actions_campaign_idx").on(t.campaignId, t.at)],
).enableRLS();

/** F29-C · Weekly learnings: statistical finding + narrative grounded in its evidence. */
export const adLearnings = pgTable(
  "ad_learnings",
  {
    id: id(),
    dimension: text("dimension").notNull(),
    metric: text("metric").notNull(),
    winner: text("winner").notNull(),
    statement: text("statement").notNull(),
    /** 'insuficiente' | 'baja' | 'media' | 'alta' */
    confidence: text("confidence").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    /** 'ai' when Claude's text passed the number check, 'template' otherwise. */
    source: text("source").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    /** 'vigente' | 'reemplazado' */
    status: text("status").notNull().default("vigente"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("ad_learnings_status_idx").on(t.status, t.createdAt)],
).enableRLS();

/** F30 · Team login accounts (no sign-up: created with `npm run auth:set-password`). Only the scrypt hash is stored. */
export const users = pgTable(
  "users",
  {
    id: id(),
    /** lowercase */
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
).enableRLS(); // Supabase's REST API exposes `public`: RLS with no policies keeps the hashes unreachable from it.

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
).enableRLS();

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
).enableRLS();


/** Team settings editable from /app/settings (key -> JSON value). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

/** F31 · Precomputed dashboard metrics (one row per key and range). Read by the dashboard and Pauta; refreshed in the background. */
export const metricsSnapshots = pgTable(
  "metrics_snapshots",
  {
    key: text("key").notNull(),
    rangeDays: integer("range_days").notNull(),
    data: jsonb("data").$type<unknown>().notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
  },
  (t) => [uniqueIndex("metrics_snapshots_key_range_uq").on(t.key, t.rangeDays)],
).enableRLS(); // Same as `users`: not reachable through Supabase's REST API.
