import { eq } from "drizzle-orm";
import { normalizeName } from "@/features/coverage/metrics";
import { companies, companySources, hunts } from "@/db/schema";
import type { AppDb } from "@/db/types";
import type { SourceCompany } from "./types";

export interface PersistSummary {
  found: number;
  inserted: number;
  skipped: number;
}

/**
 * Saves OSM results as `companies` + `company_sources` (no dedupe across sources: F07 does that).
 * Idempotent per `(channel, external_id)`. Mock rows are flagged `is_mock` + `is_demo` so they stay out of real totals.
 * Records `{found, inserted, skipped}` in `hunts.progress.osm`. Cost is 0 (Overpass is free); license/URL are kept per source.
 */
export async function persistOverpassResults(db: AppDb, huntId: string, items: readonly SourceCompany[]): Promise<PersistSummary> {
  let inserted = 0;
  for (const c of items) {
    const existing = await db
      .select({ id: companySources.id })
      .from(companySources)
      .where(eq(companySources.externalId, c.externalId))
      .limit(1);
    if (existing.length > 0) continue;
    const [company] = await db
      .insert(companies)
      .values({
        name: c.name,
        normalizedName: normalizeName(c.name),
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        city: c.city,
        website: c.website,
        isDemo: c.isMock,
      })
      .returning({ id: companies.id });
    await db.insert(companySources).values({
      companyId: company.id,
      sourceChannel: c.sourceChannel,
      externalId: c.externalId,
      raw: { ...c.raw, phone_e164: c.phone ?? null, email: c.email ?? null },
      sourceUrl: c.sourceUrl,
      license: c.license,
      isMock: c.isMock,
    });
    inserted++;
  }
  const summary = { found: items.length, inserted, skipped: items.length - inserted };
  const [hunt] = await db.select({ progress: hunts.progress }).from(hunts).where(eq(hunts.id, huntId)).limit(1);
  if (hunt) await db.update(hunts).set({ progress: { ...hunt.progress, osm: summary } }).where(eq(hunts.id, huntId));
  return summary;
}
