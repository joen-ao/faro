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
/** Landing figures are rounded examples: from 100 up they read "+20.000". */
export const formatCount = (v: number): string => (v >= 100 ? `+${int.format(v)}` : int.format(v));

const ratioFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** One honest sentence comparing free sources with paid ads; coherent with the cards (incl. free CPL = 0). */
export function describeComparison(s: Extract<LandingStats, { state: "ready" }>): string {
  if (s.freeVsPaidRatio !== null) {
    const r = s.freeVsPaidRatio;
    if (Math.abs(r - 1) < 0.05) return "Hoy, un lead de fuentes gratuitas cuesta lo mismo que uno de pauta.";
    return r > 1
      ? `Hoy, cada lead de fuentes gratuitas cuesta ${ratioFmt.format(r)} veces menos que uno de pauta.`
      : `Hoy, cada lead de fuentes gratuitas cuesta ${ratioFmt.format(1 / r)} veces más que uno de pauta.`;
  }
  if (s.free.cpl === 0 && s.paid.cpl !== null) {
    return `Las fuentes gratuitas no tuvieron costo atribuido; la pauta costó ${formatUsd(s.paid.cpl)} por lead.`;
  }
  if (s.free.cpl === 0) return "Las fuentes gratuitas no tuvieron costo atribuido. Aún no hay pauta registrada para comparar.";
  return "Aún no hay datos suficientes de ambos lados para comparar: el CPL aparece cuando hay leads y gasto en cada canal.";
}

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
