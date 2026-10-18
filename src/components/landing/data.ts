import { and, eq, inArray, sql } from "drizzle-orm";
import { getReadyDb } from "@/db/client";
import { companies, companySources, contactPoints } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { queryComplianceMetrics } from "@/features/compliance/metrics";
import { queryChallengeFacts } from "@/features/dashboard/challenge";
import { BENCHMARK_MIN_N } from "@/features/diagnostic/benchmark";
import { isEnrichedSite, signalsOf } from "@/features/diagnostic/findings";
import { buildLandingStats, getPublicMetrics, type LandingStats, type PublicMetrics } from "@/features/metrics";

/** Share of reviewed websites with a practice; null below the benchmark minimum sample (never a shaky %). */
export interface SiteShare {
  n: number;
  pct: number | null;
}

export interface SitesSummary {
  /** Real companies with an enriched (actually read) website. */
  reviewed: number;
  whatsapp: SiteShare;
  booking: SiteShare;
}

export interface LandingData {
  stats: LandingStats;
  /** Total CPL of the profile (all sources), null without fit leads or cost. */
  cpl: number | null;
  bySource: PublicMetrics["bySource"];
  /** null when the count could not be read: the UI then says "sin datos aún". */
  mergedDuplicates: number | null;
  excludedPersons: number | null;
  naturalPersonsContacted: number | null;
  sites: SitesSummary | null;
}

const share = (vals: boolean[]): SiteShare => ({
  n: vals.length,
  pct: vals.length >= BENCHMARK_MIN_N ? vals.filter(Boolean).length / vals.length : null,
});

/** Website signals across every real company (no demo, no mock). Aggregates only, never names. */
async function querySites(db: AppDb): Promise<SitesSummary> {
  const rows = await db
    .selectDistinctOn([companySources.companyId], { companyId: companySources.companyId, raw: companySources.raw })
    .from(companySources)
    .innerJoin(companies, eq(companies.id, companySources.companyId))
    .where(
      and(
        eq(companySources.sourceChannel, "website"),
        eq(companySources.isMock, false),
        eq(companies.isDemo, false),
        sql`exists (select 1 from leads l where l.company_id = ${companies.id} and not l.is_demo)`,
      ),
    );
  const enriched = rows.filter((r) => isEnrichedSite({ sourceChannel: "website", raw: r.raw }));
  if (!enriched.length) return { reviewed: 0, whatsapp: share([]), booking: share([]) };
  const ids = enriched.map((r) => r.companyId);
  const wa = await db
    .select({ companyId: contactPoints.companyId })
    .from(contactPoints)
    .where(and(inArray(contactPoints.companyId, ids), eq(contactPoints.sourceChannel, "website"), eq(contactPoints.type, "whatsapp")));
  const withWa = new Set(wa.map((c) => c.companyId));
  return {
    reviewed: enriched.length,
    whatsapp: share(enriched.map((r) => withWa.has(r.companyId))),
    booking: share(enriched.map((r) => signalsOf(r.raw)?.onlineBooking === true)),
  };
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error(`landing: ${label} unavailable`, e);
    return null;
  }
}

/** Real aggregates only; every failure degrades to the honest empty state of its own block. */
export async function loadLandingData(): Promise<LandingData> {
  const db = await safe("db", async () => (await getReadyDb()) as unknown as AppDb);
  if (!db) {
    return { stats: buildLandingStats(null), cpl: null, bySource: [], mergedDuplicates: null, excludedPersons: null, naturalPersonsContacted: null, sites: null };
  }
  const [metrics, facts, compliance, sites] = await Promise.all([
    safe("metrics", () => getPublicMetrics(db)),
    safe("facts", () => queryChallengeFacts(db)),
    safe("compliance", () => queryComplianceMetrics(db)),
    safe("sites", () => querySites(db)),
  ]);
  const stats = buildLandingStats(metrics);
  return {
    stats,
    cpl: stats.state === "ready" ? (metrics?.cpl ?? null) : null,
    bySource: stats.state === "ready" ? (metrics?.bySource ?? []) : [],
    mergedDuplicates: facts?.mergedDuplicates ?? null,
    excludedPersons: facts?.excludedPersons ?? null,
    naturalPersonsContacted: compliance?.naturalPersonsContacted ?? null,
    sites,
  };
}
