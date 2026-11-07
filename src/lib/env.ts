import { z } from "zod";

/** Empty strings (as in .env.example) are treated as "unset". */
const optStr = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());
const strDefault = (d: string) => z.preprocess((v) => (v === "" ? undefined : v), z.string().default(d));
const mode = (d: "real" | "mock") =>
  z.preprocess((v) => (v === "" ? undefined : v), z.enum(["real", "mock"]).default(d));
const bool = (d: boolean) =>
  z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : typeof v === "string" ? ["true", "1", "yes"].includes(v.toLowerCase()) : v),
    z.boolean().default(d),
  );
const num = (d: number) =>
  z.preprocess((v) => (v === "" || v === undefined ? undefined : Number(v)), z.number().finite().default(d));

export const envSchema = z.object({
  NEXT_PUBLIC_PRODUCT_NAME: strDefault("Faro"),
  NEXT_PUBLIC_APP_URL: strDefault("http://localhost:3000"),
  DATABASE_URL: optStr,
  ANTHROPIC_API_KEY: optStr,
  ANTHROPIC_MODEL: optStr,
  /** F42 · model for outreach emails (short, fully grounded copy); default claude-haiku-5-5. */
  ANTHROPIC_OUTREACH_MODEL: optStr,
  ANTHROPIC_MODE: mode("mock"),
  OVERPASS_URL: strDefault("https://overpass-api.de/api/interpreter"),
  OVERPASS_MODE: mode("real"),
  SOCRATA_APP_TOKEN: optStr,
  SOCRATA_RUES_DATASET: strDefault("c82u-588k"),
  SOCRATA_REPS_DATASET: strDefault("c36g-9fc2"),
  SOCRATA_MODE: mode("real"),
  GOOGLE_PLACES_API_KEY: optStr,
  GOOGLE_PLACES_MODE: mode("mock"),
  APIFY_TOKEN: optStr,
  APIFY_CONTACT_ACTOR_ID: optStr,
  APIFY_MODE: mode("mock"),
  /** Free website/social discovery (F22): Brave Search API (free plan) or Google Programmable Search (100/day free). */
  BRAVE_SEARCH_API_KEY: optStr,
  GOOGLE_CSE_KEY: optStr,
  GOOGLE_CSE_CX: optStr,
  /** Hard cap of free-search API calls per calendar month (Brave gives ~1,000 free; past that it bills the card). */
  WEB_SEARCH_MONTHLY_LIMIT: num(900),
  EMAIL_PROVIDER: strDefault("resend"),
  RESEND_API_KEY: optStr,
  EMAIL_FROM: optStr,
  EMAIL_REPLY_TO: optStr,
  EMAIL_MODE: mode("mock"),
  SEND_ENABLED: bool(false),
  OPTOUT_SECRET: optStr,
  DAPTA_MODE: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["widget_only", "http_push", "csv_export"]).default("widget_only"),
  ),
  NEXT_PUBLIC_WHATSAPP_NUMBER: strDefault("573014734934"),
  DAPTA_PUSH_URL: optStr,
  DAPTA_PUSH_API_KEY: optStr,
  DAPTA_WEBHOOK_SECRET: optStr,
  DAPTA_CREDIT_USD: num(0.001),
  DAPTA_CREDITS_PER_AI_REPLY: num(40),
  WHATSAPP_ENABLED: bool(false),
  WHATSAPP_WEBHOOK_SECRET: optStr,
  /** F24: `dapta_flow` sends approved templates through a Dapta FlowStudio webhook; F45: `cloud_api` sends them through
   * Meta's Cloud API (needs WA_AGENT_MODE=real); `off` sends nothing. */
  WHATSAPP_SEND_MODE: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["off", "dapta_flow", "cloud_api"]).default("off")),
  /** Webhook URL of the Dapta flow "Faro · Enviar plantilla WhatsApp" (carries its own key: secret). */
  DAPTA_WA_FLOW_URL: optStr,
  /** Dapta ids of templates created after the clinic one (empty -> that template is not offered). */
  DAPTA_WA_TEMPLATE_CLINICA: optStr,
  DAPTA_WA_TEMPLATE_EMPRESA: optStr,
  DAPTA_WA_TEMPLATE_INDEPENDIENTE: optStr,
  WHATSAPP_DAILY_LIMIT: num(50),
  /** F44 · Faro's own WhatsApp agent on Meta's Cloud API. `real` needs the phone number id, token and app secret. */
  WA_AGENT_MODE: mode("mock"),
  WA_PHONE_NUMBER_ID: optStr,
  WA_BUSINESS_ACCOUNT_ID: optStr,
  /** System-user token with whatsapp_business_messaging (secret). */
  WA_ACCESS_TOKEN: optStr,
  /** App secret: signs every webhook delivery (X-Hub-Signature-256). */
  WA_APP_SECRET: optStr,
  /** Echoed back to Meta when it verifies the webhook URL. */
  WA_VERIFY_TOKEN: optStr,
  WA_GRAPH_VERSION: strDefault("v25.0"),
  /** Seconds to wait after the last inbound message before answering, so a burst gets one reply. */
  WA_AGENT_DEBOUNCE_S: num(4),
  ANTHROPIC_WA_AGENT_MODEL: optStr,
  /** F45 · One follow-up when the contact goes quiet after a question: minutes to wait and how many at most. */
  WA_FOLLOWUP_AFTER_MIN: num(120),
  WA_FOLLOWUP_MAX: num(1),
  /** mokub.co agent endpoints (availability/book); the key goes in the path. */
  MOKUB_AGENT_BASE_URL: strDefault("https://www.mokub.co"),
  MOKUB_AGENT_KEY: optStr,
  /** Booked calls, purchase intents and hand-offs are emailed here. */
  OWNER_EMAIL: optStr,
  /** F27: replies go to r.<slug>@EMAIL_REPLY_DOMAIN (a Resend receiving subdomain), so each reply names its lead. */
  EMAIL_REPLY_DOMAIN: optStr,
  /** F27: every inbound reply is forwarded here (the team's real mailbox). */
  REPLY_FORWARD_TO: optStr,
  /** F27: full-access Resend key to read received emails (a sending-only key cannot); falls back to RESEND_API_KEY. */
  RESEND_INBOUND_API_KEY: optStr,
  /** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` (F25). */
  CRON_SECRET: optStr,
  META_ADS_CAMPAIGN_ID: optStr,
  /** F28: Meta Marketing API. `real` only with token + ad account + page; otherwise mock. */
  META_ADS_MODE: mode("mock"),
  /** System-user token (secret). Never logged or returned. */
  META_ACCESS_TOKEN: optStr,
  /** `act_<id>` of the ad account the system user can manage. */
  META_AD_ACCOUNT_ID: optStr,
  META_PAGE_ID: optStr,
  META_API_VERSION: strDefault("v25.0"),
  /** COP per USD used to store COP spend as USD in `ad_spend.usd` (the rate used is saved per row). */
  META_COP_PER_USD: num(4000),
  /** Comma-separated hosts an ad may link to (the app's own host is always allowed). */
  META_ADS_ALLOWED_DOMAINS: strDefault("mokub.co,www.mokub.co,web.mokub.co"),
  /** F28 guardrail: activating a campaign (spending money) is refused unless this is true. */
  ADS_SPEND_ENABLED: bool(false),
  /** Max daily budget per campaign, in COP, for creating and activating campaigns. */
  ADS_MAX_DAILY_BUDGET_COP: num(50000),
  /** F31: Meta dataset (pixel) id. Empty = no pixel in the browser and no Conversions API events. */
  META_PIXEL_ID: optStr,
  /** F31: optional Events Manager test code; while set, server events show up in "Test events". */
  META_CAPI_TEST_CODE: optStr,
  NEXT_PUBLIC_MAP_STYLE_URL: optStr,
  SENDER_LEGAL_NAME: optStr,
  SENDER_ADDRESS: optStr,
  /** F52 · Person who signs cold emails (else "Equipo de <seller>"), their role and a public photo URL. */
  SENDER_PERSON_NAME: optStr,
  SENDER_PERSON_ROLE: optStr,
  SENDER_PERSON_PHOTO_URL: optStr,
  HUMAN_MINUTE_RATE_USD: num(0.42),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(source);
}

let cached: Env | undefined;
export function getEnv(): Env {
  return (cached ??= parseEnv());
}

export type Service = "anthropic" | "overpass" | "socrata" | "google_places" | "apify" | "email";
export type ServiceMode = "real" | "mock";
export const SERVICES: readonly Service[] = ["anthropic", "overpass", "socrata", "google_places", "apify", "email"];

/** Whether the credentials a service needs are present. Public APIs need none. */
function hasCredentials(service: Service, env: Env): boolean {
  switch (service) {
    case "anthropic":
      return !!env.ANTHROPIC_API_KEY;
    case "google_places":
      return !!env.GOOGLE_PLACES_API_KEY;
    case "apify":
      return !!env.APIFY_TOKEN;
    case "email":
      return !!env.RESEND_API_KEY && !!env.EMAIL_FROM;
    case "overpass":
    case "socrata":
      return true;
  }
}

const requestedMode = (service: Service, env: Env): ServiceMode => {
  const key = {
    anthropic: "ANTHROPIC_MODE",
    overpass: "OVERPASS_MODE",
    socrata: "SOCRATA_MODE",
    google_places: "GOOGLE_PLACES_MODE",
    apify: "APIFY_MODE",
    email: "EMAIL_MODE",
  } as const;
  return env[key[service]];
};

/** Effective mode: `real` only when requested AND credentials exist; otherwise `mock`. */
export function resolveMode(service: Service, env: Env = getEnv()): ServiceMode {
  return requestedMode(service, env) === "real" && hasCredentials(service, env) ? "real" : "mock";
}
