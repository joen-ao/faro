import { eq, inArray } from "drizzle-orm";
import { normalizeName } from "@/features/coverage/metrics";
import { companies, companySources, hunts } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { screenOsmCompanies } from "@/features/compliance/person-name";
import type { SourceCompany } from "./types";

export interface PersistSummary {
  found: number;
  inserted: number;
  skipped: number;
  /** Names that read like a natural person: neither stored nor shown, only counted. */
  excluded_personal: number;
}

/**
 * Saves OSM results as `companies` + `company_sources` (no dedupe across sources: F07 does that).
 * Idempotent per `(channel, external_id)`. Mock rows are flagged `is_mock` + `is_demo` so they stay out of real totals.
 * Records `{found, inserted, skipped}` in `hunts.progress.osm`. Cost is 0 (Overpass is free); license/URL are kept per source.
 */
export async function persistOverpassResults(db: AppDb, huntId: string, all: readonly SourceCompany[]): Promise<PersistSummary> {
  const { kept: items, excluded: excludedPersonal } = screenOsmCompanies(all);
  return db.transaction(async (tx) => {
    const ids = items.map((c) => c.externalId);
    const existing = ids.length
      ? new Set((await tx.select({ id: companySources.externalId }).from(companySources).where(inArray(companySources.externalId, ids))).map((r) => r.id))
      : new Set<string>();
    const seen = new Set<string>();
    const fresh = items.filter((c) => {
      if (existing.has(c.externalId) || seen.has(c.externalId)) return false;
      seen.add(c.externalId);
      return true;
    });
    if (fresh.length > 0) {
      const rows = await tx
        .insert(companies)
        .values(
          fresh.map((c) => ({
            name: c.name,
            normalizedName: normalizeName(c.name),
            address: c.address,
            lat: c.lat,
            lng: c.lng,
            city: c.city,
            website: c.website,
            isDemo: c.isMock,
            isLegalEntity: c.isLegalEntity ?? true,
          })),
        )
        .returning({ id: companies.id });
      await tx.insert(companySources).values(
        fresh.map((c, i) => ({
          companyId: rows[i].id,
          sourceChannel: c.sourceChannel,
          externalId: c.externalId,
          raw: { ...c.raw, phone_e164: c.phone ?? null, email: c.email ?? null },
          sourceUrl: c.sourceUrl,
          license: c.license,
          isMock: c.isMock,
        })),
      );
    }
    const summary = { found: items.length, inserted: fresh.length, skipped: items.length - fresh.length, excluded_personal: excludedPersonal };
    const [hunt] = await tx.select({ progress: hunts.progress }).from(hunts).where(eq(hunts.id, huntId)).limit(1);
    if (hunt) await tx.update(hunts).set({ progress: { ...hunt.progress, osm: summary } }).where(eq(hunts.id, huntId));
    return summary;
  });
}
