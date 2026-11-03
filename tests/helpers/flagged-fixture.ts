import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { seedCostRates } from "@/db/seed";
import type { AppDb } from "@/db/types";

/**
 * Test-only fixture (was the demo `db:seed` before F31): flagged rows that must never reach real totals.
 * Everything is is_demo=true / is_mock=true. Idempotent.
 */
export async function seedFlaggedFixture(db: AppDb): Promise<{ skippedDemo: boolean }> {
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
