import type { AdPerformance } from "./performance";
import { wilson, type Interval } from "./stats";

/**
 * F29-C · Group per-ad results by concept (angle) and by format, and decide — with statistics, not with the model —
 * whether one group really beats the others. Sample sizes from the playbook (cap. 7):
 * CTR 1 % vs 1,5 % needs ~7.700 impressions per arm; qualification 20 % vs 40 % needs ~78 leads per arm.
 */

export type Confidence = "insuficiente" | "baja" | "media" | "alta";
export type Dimension = "angle" | "format_hint";
export type Metric = "ctr" | "qualification_rate";

export const SAMPLE = {
  ctr: { low: 3000, high: 7700 },
  qualification_rate: { low: 20, high: 78 },
} as const;

export interface GroupStats {
  key: string;
  ads: number;
  spend: number;
  impressions: number;
  linkClicks: number;
  leads: number;
  qualified: number;
  ctr: number | null;
  ctrInterval: Interval | null;
  qualificationRate: number | null;
  qualificationInterval: Interval | null;
  cpql: number | null;
}

export interface Finding {
  id: string;
  dimension: Dimension;
  metric: Metric;
  winner: string;
  runnerUp: string | null;
  winnerValue: number | null;
  runnerUpValue: number | null;
  winnerN: number;
  runnerUpN: number;
  confidence: Confidence;
  groups: GroupStats[];
}

export function groupBy(rows: AdPerformance[], dimension: Dimension): GroupStats[] {
  const map = new Map<string, AdPerformance[]>();
  for (const r of rows) {
    const key = dimension === "angle" ? r.angle : r.formatHint;
    if (!key) continue;
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()].map(([key, list]) => {
    const sum = (f: (r: AdPerformance) => number) => list.reduce((a, r) => a + f(r), 0);
    const impressions = sum((r) => r.impressions);
    const linkClicks = sum((r) => r.linkClicks);
    const leads = sum((r) => r.leads);
    const qualified = sum((r) => r.qualified);
    const spend = sum((r) => r.spendLocal);
    return {
      key,
      ads: list.length,
      spend,
      impressions,
      linkClicks,
      leads,
      qualified,
      ctr: impressions ? linkClicks / impressions : null,
      ctrInterval: wilson(linkClicks, impressions),
      qualificationRate: leads ? qualified / leads : null,
      qualificationInterval: wilson(qualified, leads),
      cpql: qualified ? spend / qualified : null,
    };
  });
}

/** Confidence that the best group beats the runner-up on `metric`. */
export function compare(groups: GroupStats[], dimension: Dimension, metric: Metric): Finding | null {
  const value = (g: GroupStats) => (metric === "ctr" ? g.ctr : g.qualificationRate);
  const n = (g: GroupStats) => (metric === "ctr" ? g.impressions : g.leads);
  const interval = (g: GroupStats) => (metric === "ctr" ? g.ctrInterval : g.qualificationInterval);
  const ranked = groups.filter((g) => value(g) !== null).sort((a, b) => value(b)! - value(a)!);
  if (ranked.length < 2) return null;
  const [w, r] = [ranked[0]!, ranked[1]!];
  const minN = Math.min(n(w), n(r));
  const t = SAMPLE[metric];
  const separated = !!interval(w) && !!interval(r) && interval(w)!.low > interval(r)!.high;
  let confidence: Confidence = "insuficiente";
  if (minN >= t.high && separated) confidence = "alta";
  else if (minN >= t.low && separated) confidence = "media";
  else if (minN >= t.low) confidence = "baja";
  return {
    id: `${dimension}:${metric}`,
    dimension,
    metric,
    winner: w.key,
    runnerUp: r.key,
    winnerValue: value(w),
    runnerUpValue: value(r),
    winnerN: n(w),
    runnerUpN: n(r),
    confidence,
    groups: ranked,
  };
}

export function computeFindings(rows: AdPerformance[]): Finding[] {
  const out: Finding[] = [];
  for (const dimension of ["angle", "format_hint"] as const) {
    const groups = groupBy(rows, dimension);
    for (const metric of ["ctr", "qualification_rate"] as const) {
      const f = compare(groups, dimension, metric);
      if (f) out.push(f);
    }
  }
  return out;
}

/** Every number a narrative may cite for this finding, in the forms a writer would use. */
export function allowedNumbers(f: Finding): Set<string> {
  const out = new Set<string>();
  const add = (v: number | null) => {
    if (v === null || !Number.isFinite(v)) return;
    for (const x of [v, v * 100]) for (const d of [0, 1, 2]) {
      const s = x.toFixed(d);
      out.add(s);
      out.add(s.replace(".", ","));
    }
    out.add(Math.round(v).toLocaleString("es-CO"));
  };
  [f.winnerValue, f.runnerUpValue, f.winnerN, f.runnerUpN, f.groups.length].forEach(add);
  for (const g of f.groups) [g.impressions, g.leads, g.qualified, g.ads].forEach(add);
  return out;
}

/** Numbers in `text` that the evidence does not contain (empty = the narrative is grounded). */
export function ungroundedNumbers(text: string, f: Finding): string[] {
  const allowed = allowedNumbers(f);
  return [...text.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0]).filter((n) => !allowed.has(n) && !allowed.has(n.replace(/\./g, "")));
}

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(2)} %`);
const LABEL: Record<Metric, string> = { ctr: "CTR de enlace", qualification_rate: "tasa de calificación" };

/** Deterministic fallback narrative (also used when the model's text cites numbers not in the evidence). */
export function templateStatement(f: Finding): string {
  const what = f.dimension === "angle" ? "El ángulo" : "El formato";
  if (f.confidence === "insuficiente") return `Datos insuficientes para comparar ${LABEL[f.metric]} entre ${f.dimension === "angle" ? "ángulos" : "formatos"}.`;
  return `${what} "${f.winner}" tiene mejor ${LABEL[f.metric]} (${pct(f.winnerValue)}) que "${f.runnerUp}" (${pct(f.runnerUpValue)}); confianza ${f.confidence}.`;
}
