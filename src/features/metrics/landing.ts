import type { PublicMetrics } from "./public";

export type LandingSide = { fit: number; costUsd: number; cpl: number | null };

export type LandingStats =
  | { state: "empty" }
  | {
      state: "ready";
      leadsFound: number;
      leadsFit: number;
      contacted: number;
      qualified: number;
      totalCostUsd: number;
      paid: LandingSide;
      free: LandingSide;
      /** Only set when both sides have a CPL: how many times cheaper the free sources are (>1) or pricier (<1). */
      freeVsPaidRatio: number | null;
    };

const usd = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("es-CO");

export const formatUsd = (v: number | null): string => (v === null ? "—" : usd.format(v).replace(/\s/g, " "));
export const formatCount = (v: number): string => int.format(v);

/**
 * Decides what the landing shows from the public metrics (real data only).
 * `null` (API/DB failure) or no real data → "empty": never fabricate numbers.
 */
export function buildLandingStats(m: PublicMetrics | null): LandingStats {
  if (!m || !m.hasData) return { state: "empty" };
  const { paid, free } = m.paidVsFree;
  const freeVsPaidRatio = paid.cpl !== null && free.cpl !== null && free.cpl > 0 ? paid.cpl / free.cpl : null;
  return {
    state: "ready",
    leadsFound: m.leadsFound,
    leadsFit: m.leadsFit,
    contacted: m.contacted,
    qualified: m.qualified,
    totalCostUsd: m.totalCostUsd,
    paid,
    free,
    freeVsPaidRatio,
  };
}
