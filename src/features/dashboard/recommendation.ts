import type { ChannelMetrics, MetricsBucket, MetricsRow } from "@/features/metrics/channels";
import { fmtInt, fmtPct, fmtUsd, sourceLabel } from "./format";

/** Minimum sample per source to be comparable: profile leads and qualified leads. */
export const MIN_FIT = 5;
export const MIN_QUALIFIED = 1;
/** CPLC gap (relative to the best) under which two sources are a technical tie. */
export const TIE_GAP = 0.1;

export type RecommendationKind = "winner" | "tie" | "insufficient" | "demo_only";

export interface Recommendation {
  kind: RecommendationKind;
  text: string;
  /** Winning source(s); empty unless kind is winner/tie. */
  sources: string[];
}

const comparable = (r: MetricsRow) => r.source !== null && r.fit >= MIN_FIT && r.qualified >= MIN_QUALIFIED && r.cplc !== null;

/**
 * Sentence for the dashboard, built only from REAL numbers. Demo/mock data (`metrics.demo`) is never
 * used to recommend; if it is all there is, the sentence says so.
 */
export function buildRecommendation(metrics: Pick<ChannelMetrics, "real"> & { demo?: MetricsBucket | null }): Recommendation {
  const real = metrics.real.bySource;
  const ok = real.filter(comparable).sort((a, b) => (a.cplc as number) - (b.cplc as number));

  if (ok.length < 2) {
    if (real.length === 0 && metrics.demo && metrics.demo.bySource.length > 0) {
      return {
        kind: "demo_only",
        sources: [],
        text: "Solo hay datos de prueba (DEMO). No se hace ninguna recomendación con ellos: busca y contacta empresas reales para compararlas.",
      };
    }
    const total = metrics.real.totals;
    const why =
      real.length === 0
        ? "Aún no hay leads reales."
        : ok.length === 1
          ? `Solo ${sourceLabel(ok[0].source)} tiene calificados; falta otra fuente con al menos ${MIN_FIT} leads del perfil y ${MIN_QUALIFIED} calificado para comparar.`
          : `Con ${fmtInt(total.fit)} leads del perfil y ${fmtInt(total.qualified)} calificados todavía no alcanza para comparar fuentes (mínimo ${MIN_FIT} del perfil y ${MIN_QUALIFIED} calificado por fuente).`;
    return { kind: "insufficient", sources: [], text: `Datos insuficientes para recomendar una fuente. ${why}` };
  }

  const [best, second] = ok;
  const bestC = best.cplc as number;
  const secondC = second.cplc as number;
  const gap = (secondC - bestC) / secondC; // how much cheaper the best is vs the runner-up
  const rate = (r: MetricsRow) => `${r.qualified} de ${r.fit} (${fmtPct(r.qualified / r.fit)})`;

  if ((secondC - bestC) / bestC < TIE_GAP) {
    return {
      kind: "tie",
      sources: [best.source as string, second.source as string],
      text: `Empate técnico entre ${sourceLabel(best.source)} y ${sourceLabel(second.source)}: costo por lead calificado ${fmtUsd(bestC)} vs ${fmtUsd(secondC)} (menos de ${Math.round(TIE_GAP * 100)} % de diferencia). Hace falta más muestra para decidir.`,
    };
  }
  return {
    kind: "winner",
    sources: [best.source as string],
    text:
      `Conviene buscar en ${sourceLabel(best.source)}: CPLC ${fmtUsd(bestC)} vs ${fmtUsd(secondC)} en ${sourceLabel(second.source)} (${fmtPct(gap)} menos). ` +
      `CPL ${fmtUsd(best.cpl)} vs ${fmtUsd(second.cpl)}; calificados ${rate(best)} vs ${rate(second)}.`,
  };
}

/** Pauta (meta_ads) vs. everything else, summed from real source rows. */
export interface PaidVsFree {
  paid: MetricsRow | null;
  free: { fit: number; qualified: number; costUsd: number; cpl: number | null; cplc: number | null };
}
export function splitPaidVsFree(bySource: MetricsRow[]): PaidVsFree {
  const paid = bySource.find((r) => r.source === "meta_ads") ?? null;
  const rest = bySource.filter((r) => r.source !== "meta_ads");
  const fit = rest.reduce((a, r) => a + r.fit, 0);
  const qualified = rest.reduce((a, r) => a + r.qualified, 0);
  const costUsd = rest.reduce((a, r) => a + r.costUsd, 0);
  return { paid, free: { fit, qualified, costUsd, cpl: fit > 0 ? costUsd / fit : null, cplc: qualified > 0 ? costUsd / qualified : null } };
}
