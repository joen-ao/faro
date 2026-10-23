import { sendWindowPolicy, type SendWindowSetting } from "@/features/compliance/windows";
import type { LandingStats, PublicMetrics } from "@/features/metrics";

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
  /** Active send window: the panel setting, else SEND_WINDOW_POLICY. */
  sendWindow: SendWindowSetting;
}

/**
 * The landing shows fixed, rounded example figures ("+20.000"): it never queries the database, so it loads instantly and
 * a heavy dashboard query can never take the public page down. Real numbers live in the team dashboard.
 */
export const LANDING_EXAMPLE: LandingData = {
  stats: {
    state: "ready",
    leadsFound: 20_000,
    leadsFit: 1_000,
    contacted: 50,
    qualified: 0,
    totalCostUsd: 9,
    paid: { fit: 0, costUsd: 0, cpl: null },
    free: { fit: 1_000, costUsd: 9, cpl: 0.009 },
    freeVsPaidRatio: null,
  },
  cpl: 0.009,
  bySource: [
    { source: "rues", fit: 600, costUsd: 2, cpl: 0.003, free: true },
    { source: "reps", fit: 250, costUsd: 2, cpl: 0.008, free: true },
    { source: "secop", fit: 100, costUsd: 0.5, cpl: 0.005, free: true },
    { source: "osm", fit: 50, costUsd: 0, cpl: 0, free: true },
  ],
  mergedDuplicates: 300,
  excludedPersons: null,
  naturalPersonsContacted: 0,
  sites: { reviewed: 200, whatsapp: { n: 200, pct: 0.39 }, booking: { n: 200, pct: 0.24 } },
  sendWindow: { policy: sendWindowPolicy() },
};

export async function loadLandingData(): Promise<LandingData> {
  return LANDING_EXAMPLE;
}
