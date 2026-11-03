import { eq } from "drizzle-orm";
import * as s from "./schema";
import type { AppDb, NewCostRate } from "./types";

/** Default rates (SPEC §7). Real configuration, not demo data. Prices are list prices, editable in DB. */
export const DEFAULT_COST_RATES: NewCostRate[] = [
  { key: "anthropic_input_per_1m", category: "ai", unit: "USD/1M input tokens", usd: 3, description: "Anthropic input tokens (list price, configurable)" },
  { key: "anthropic_output_per_1m", category: "ai", unit: "USD/1M output tokens", usd: 15, description: "Anthropic output tokens (list price, configurable)" },
  { key: "places_per_call", category: "data", unit: "USD/call", usd: 0.032, description: "Google Places API call; list value shown even if covered by free tier" },
  { key: "apify_per_result", category: "scraping", unit: "USD/result", usd: 0.005, description: "Apify per scraped result (real run usageTotalUsd preferred)" },
  { key: "email_per_message", category: "email", unit: "USD/email", usd: 0.0004, description: "Transactional email; list value even in free tier" },
  { key: "dapta_credit", category: "dapta", unit: "USD/credit", usd: 0.001, description: "1 USD per 1,000 Dapta credits" },
  { key: "dapta_credits_per_ai_reply", category: "dapta", unit: "credits/AI reply", usd: 40, description: "Credits per AI reply (a count, not USD)" },
  { key: "whatsapp_template", category: "whatsapp", unit: "USD/template", usd: 0.0125, description: "Meta marketing template, Colombia (configurable)" },
  { key: "human_minute", category: "human", unit: "USD/minute", usd: 0.42, description: "Assisted web-form human minute (25 USD/h)" },
];

/** Idempotent: re-running does not duplicate rows. */
export async function seedCostRates(db: AppDb): Promise<void> {
  await db.insert(s.costRates).values(DEFAULT_COST_RATES).onConflictDoNothing({ target: s.costRates.key });
}

/** Well-known demo lead for the public diagnostic page (/d/demo-clinica), screenshots and e2e. Idempotent, all is_demo/is_mock. */
export const DEMO_DIAGNOSTIC_SLUG = "demo-clinica";

export async function seedDiagnosticDemo(db: AppDb): Promise<{ created: boolean }> {
  const found = await db.select({ id: s.leads.id }).from(s.leads).where(eq(s.leads.slug, DEMO_DIAGNOSTIC_SLUG));
  if (found.length > 0) return { created: false };
  const [company] = await db
    .insert(s.companies)
    .values({
      name: "Clinica Dental Sonrisa Norte SAS",
      normalizedName: "clinica dental sonrisa norte",
      address: "Calle 127 # 15-20, Bogota",
      city: "Bogota",
      lat: 4.7,
      lng: -74.04,
      website: "https://sonrisa-norte.example",
      isDemo: true,
    })
    .returning();
  await db.insert(s.companySources).values([
    { companyId: company.id, sourceChannel: "reps", externalId: "demo-diag-reps", raw: { demo: true }, sourceUrl: "https://www.datos.gov.co/", license: "CC BY-SA 4.0", isMock: true },
    {
      companyId: company.id,
      sourceChannel: "website",
      externalId: "demo-diag-web",
      raw: {
        demo: true,
        fetchedPages: 3,
        signals: { onlineBooking: false, noAppointmentForm: false, hasContactForm: true, copyrightYear: 2022, socialNetworks: ["instagram", "facebook"] },
      },
      sourceUrl: "https://sonrisa-norte.example",
      isMock: true,
    },
    { companyId: company.id, sourceChannel: "osm", externalId: "demo-diag-osm", raw: { demo: true }, sourceUrl: "https://www.openstreetmap.org/copyright", license: "ODbL", isMock: true },
  ]);
  await db.insert(s.leads).values({ companyId: company.id, status: "contacted", primarySource: "sample", fitScore: 78, slug: DEMO_DIAGNOSTIC_SLUG, isDemo: true });
  return { created: true };
}
