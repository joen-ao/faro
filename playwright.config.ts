import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
process.env.APP_ACCESS_KEY ??= "e2e-app-key"; // /app and /api/outreach are closed in production without a key
process.env.FARO_ALLOW_DEMO ??= "1"; // the production build serves the seeded demo hunt (F10)
process.env.OPTOUT_SECRET ??= "e2e-only-secret"; // inherited by the web server and the test workers
process.env.FARO_SEED_DEMO = "1"; // seeds demo-clinica (F12) and enables the demo-only events read
process.env.META_ADS_CAMPAIGN_ID ??= "faro-demo"; // shows the UTM link on /app/settings/ads
process.env.FARO_E2E = "1"; // lets those demo tools run under `next start` (NODE_ENV=production)

// Isolation from the developer's .env.local: Next never overrides variables already present in the environment,
// so pinning them here keeps e2e on a local PGlite, with mocks and no third-party calls (never production data).
Object.assign(process.env, {
  DATABASE_URL: "",
  ANTHROPIC_MODE: "mock",
  ANTHROPIC_API_KEY: "",
  EMAIL_MODE: "mock",
  RESEND_API_KEY: "",
  RESEND_WEBHOOK_SECRET: "",
  SEND_ENABLED: "false",
  DAPTA_WIDGET_SNIPPET: "",
  DAPTA_MODE: "widget_only",
  DAPTA_PUSH_URL: "",
  DAPTA_PUSH_API_KEY: "",
  DAPTA_WEBHOOK_SECRET: "",
  GOOGLE_PLACES_API_KEY: "",
  APIFY_TOKEN: "",
  SEND_WINDOW_POLICY: "ley2300",
});

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1, // all specs share one PGlite directory behind one next start
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
