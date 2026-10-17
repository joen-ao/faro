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

/** Minimal demo dataset: EVERYTHING here is is_demo=true (except cost_rates). Idempotent. */
export async function seed(db: AppDb): Promise<{ skippedDemo: boolean }> {
  await seedCostRates(db);

  const existing = await db.select({ id: s.workspaces.id }).from(s.workspaces).where(eq(s.workspaces.name, "Demo Workspace"));
  if (existing.length > 0) return { skippedDemo: true };

  const [ws] = await db
    .insert(s.workspaces)
    .values({ name: "Demo Workspace", offerDescription: "Demo: software de agenda para clinicas dentales", senderName: "Faro (demo)", country: "CO" })
    .returning();
  const [icp] = await db
    .insert(s.icpProfiles)
    .values({
      workspaceId: ws.id,
      prompt: "Clinicas dentales en Bogota con sitio web",
      criteria: { sector: "dental", city: "Bogota", osmTags: ["amenity=dentist"], placesTypes: ["dentist"], signals: ["agenda en linea"], exclusions: ["profesional independiente"] },
      threshold: 60,
    })
    .returning();
  const [hunt] = await db.insert(s.hunts).values({ icpProfileId: icp.id, status: "completed", startedAt: new Date(), finishedAt: new Date() }).returning();

  const companyRows = await db
    .insert(s.companies)
    .values([
      { name: "Clinica Dental Demo Uno SAS", normalizedName: "clinica dental demo uno", city: "Bogota", lat: 4.711, lng: -74.0721, website: "https://demo-uno.example", isDemo: true },
      { name: "Odontologia Demo Dos SAS", normalizedName: "odontologia demo dos", city: "Bogota", lat: 4.65, lng: -74.06, website: "https://demo-dos.example", isDemo: true },
      { name: "Sonrisas Demo Tres SAS", normalizedName: "sonrisas demo tres", city: "Bogota", lat: 4.68, lng: -74.05, isDemo: true },
    ])
    .returning();

  await db.insert(s.companySources).values(
    companyRows.map((c, i) => ({ companyId: c.id, sourceChannel: "sample" as const, externalId: `demo-${i + 1}`, raw: { demo: true }, license: "demo", isMock: true })),
  );
  await db.insert(s.contactPoints).values([
    { companyId: companyRows[0].id, type: "email", value: "info@demo-uno.example", isGeneric: true, sourceChannel: "sample" },
    { companyId: companyRows[1].id, type: "email", value: "contacto@demo-dos.example", isGeneric: true, sourceChannel: "sample" },
  ]);

  const statuses = ["fit", "contacted", "responded"] as const;
  const leadRows = await db
    .insert(s.leads)
    .values(companyRows.map((c, i) => ({ companyId: c.id, huntId: hunt.id, status: statuses[i], primarySource: "sample" as const, fitScore: 70 + i * 5, slug: `demo-lead-${i + 1}`, isDemo: true })))
    .returning();

  await db.insert(s.events).values({ leadId: leadRows[2].id, type: "reply", payload: { demo: true }, isDemo: true, isMock: true });
  await db.insert(s.qualifications).values({ leadId: leadRows[2].id, origin: "fallback", qualified: true, score: 80, summary: "Demo qualification", isDemo: true, isMock: true });

  await db.insert(s.costEntries).values([
    { leadId: leadRows[0].id, huntId: hunt.id, sourceChannel: "sample", category: "ai", quantity: 2000, unit: "tokens", rate: 0.000003, usd: 0.006, evidence: "demo", isDemo: true, isMock: true },
    { leadId: leadRows[1].id, huntId: hunt.id, sourceChannel: "sample", contactChannel: "email", category: "email", quantity: 1, unit: "email", rate: 0.0004, usd: 0.0004, evidence: "demo", isDemo: true, isMock: true },
    { leadId: leadRows[2].id, huntId: hunt.id, sourceChannel: "sample", category: "data", quantity: 1, unit: "call", rate: 0.032, usd: 0.032, evidence: "demo", isDemo: true, isMock: true },
  ]);
  await db.insert(s.adSpend).values({ platform: "meta", campaign: "demo-campaign", date: "2026-10-17", usd: 5, impressions: 1000, clicks: 20, isDemo: true });

  return { skippedDemo: false };
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
    { companyId: company.id, sourceChannel: "website", externalId: "demo-diag-web", raw: { demo: true, hasBookingForm: false }, sourceUrl: "https://sonrisa-norte.example", isMock: true },
    { companyId: company.id, sourceChannel: "osm", externalId: "demo-diag-osm", raw: { demo: true }, sourceUrl: "https://www.openstreetmap.org/copyright", license: "ODbL", isMock: true },
  ]);
  await db.insert(s.leads).values({ companyId: company.id, status: "contacted", primarySource: "sample", fitScore: 78, slug: DEMO_DIAGNOSTIC_SLUG, isDemo: true });
  return { created: true };
}
