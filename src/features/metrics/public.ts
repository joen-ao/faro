import type { AppDb } from "@/db/types";
import { getChannelMetrics } from "./channels";

export interface PublicMetrics {
  /** False while there is no real data: the landing must then show an honest empty state. */
  hasData: boolean;
  leadsFound: number;
  leadsFit: number;
  contacted: number;
  qualified: number;
  totalCostUsd: number;
  cpl: number | null;
  cplc: number | null;
  bySource: { source: string; fit: number; costUsd: number; cpl: number | null; free: boolean }[];
  /** Paid (meta_ads) vs free sources, real data only. */
  paidVsFree: { paid: { fit: number; costUsd: number; cpl: number | null }; free: { fit: number; costUsd: number; cpl: number | null } };
}

const cpl = (cost: number, fit: number) => (fit > 0 ? cost / fit : null);

/** Aggregates for the landing page. Real data only; no company names or any per-lead field. */
export async function getPublicMetrics(db: AppDb): Promise<PublicMetrics> {
  const { real } = await getChannelMetrics(db);
  const sum = (rows: typeof real.bySource) => rows.reduce((a, r) => ({ fit: a.fit + r.fit, costUsd: a.costUsd + r.costUsd }), { fit: 0, costUsd: 0 });
  const paid = sum(real.bySource.filter((r) => r.source === "meta_ads"));
  const free = sum(real.bySource.filter((r) => r.source !== "meta_ads"));
  const t = real.totals;
  return {
    hasData: t.found > 0 || t.costUsd > 0,
    leadsFound: t.found,
    leadsFit: t.fit,
    contacted: t.contacted,
    qualified: t.qualified,
    totalCostUsd: t.costUsd,
    cpl: t.cpl,
    cplc: t.cplc,
    bySource: real.bySource.map((r) => ({ source: r.source as string, fit: r.fit, costUsd: r.costUsd, cpl: r.cpl, free: r.source !== "meta_ads" })),
    paidVsFree: {
      paid: { ...paid, cpl: cpl(paid.costUsd, paid.fit) },
      free: { ...free, cpl: cpl(free.costUsd, free.fit) },
    },
  };
}
