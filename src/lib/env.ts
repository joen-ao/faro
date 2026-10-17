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
  DAPTA_WIDGET_SNIPPET: optStr,
  DAPTA_PUSH_URL: optStr,
  DAPTA_PUSH_API_KEY: optStr,
  DAPTA_WEBHOOK_SECRET: optStr,
  DAPTA_CREDIT_USD: num(0.001),
  DAPTA_CREDITS_PER_AI_REPLY: num(40),
  WHATSAPP_ENABLED: bool(false),
  WHATSAPP_WEBHOOK_SECRET: optStr,
  META_ADS_CAMPAIGN_ID: optStr,
  NEXT_PUBLIC_MAP_STYLE_URL: optStr,
  SENDER_LEGAL_NAME: optStr,
  SENDER_ADDRESS: optStr,
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
