import type { MetricsBucket } from "@/features/metrics/channels";
import { MIN_FIT } from "@/features/dashboard/recommendation";

export const SAMPLES = 10_000;
export const MIN_TOTAL_QUALIFIED = 3;
/** Floor for cost per profile lead so free sources do not yield infinite reward per dollar. */
export const COST_FLOOR = 0.01;

export type Rng = () => number;

/** mulberry32: small seeded PRNG, deterministic across runs. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const spare = new WeakMap<Rng, number>();
/** Standard normal via Box–Muller, caching the second value of each pair (halves log/sqrt/trig calls). */
function normal(rng: Rng): number {
  const z = spare.get(rng);
  if (z !== undefined) {
    spare.delete(rng);
    return z;
  }
  const r = Math.sqrt(-2 * Math.log(1 - rng()));
  const th = 2 * Math.PI * rng();
  spare.set(rng, r * Math.sin(th));
  return r * Math.cos(th);
}

/** Gamma(shape, 1), Marsaglia–Tsang. */
function gamma(shape: number, rng: Rng): number {
  if (shape < 1) return gamma(shape + 1, rng) * Math.pow(1 - rng(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(a: number, b: number, rng: Rng): number {
  const x = gamma(a, rng);
  const y = gamma(b, rng);
  return x / (x + y);
}

export interface Arm {
  source: string;
  /** leads of the profile */
  n: number;
  /** qualified leads */
  k: number;
  /** cost per profile lead (USD) */
  costPerLead: number;
}

/** Index of the arm with the highest sampled qualified-per-dollar. */
function pickBest(arms: Arm[], rng: Rng): number {
  let best = 0;
  let bestV = -1;
  for (let i = 0; i < arms.length; i++) {
    const a = arms[i];
    const v = sampleBeta(1 + a.k, 1 + a.n - a.k, rng) / Math.max(a.costPerLead, COST_FLOOR);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  return best;
}

export function probabilityBest(arms: Arm[], seed: number, samples = SAMPLES): number[] {
  const rng = makeRng(seed);
  const wins = new Array<number>(arms.length).fill(0);
  for (let s = 0; s < samples; s++) wins[pickBest(arms, rng)]++;
  return wins.map((w) => w / samples);
}

/** Split `total` USD proportionally to `weights` in whole cents (largest remainder); sums exactly. */
export function splitCents(total: number, weights: number[]): number[] {
  const cents = Math.round(total * 100);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sum) * cents);
  const out = raw.map(Math.floor);
  let left = cents - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let j = 0; left > 0; j = (j + 1) % order.length, left--) out[order[j][1]]++;
  return out.map((c) => c / 100);
}

export interface Allocation {
  source: string;
  budgetUsd: number;
  probabilityBest: number;
  n: number;
  k: number;
}
export type NextBudget =
  | { status: "ok"; kind: "real"; budgetUsd: number; samples: number; allocations: Allocation[] }
  | { status: "insufficient"; kind: "real"; reason: string };

/** Suggested split of the next budget across REAL sources. Demo data is never read. */
export function recommendNextBudget(metrics: { real: Pick<MetricsBucket, "bySource"> }, budgetUsd: number, seed = 20): NextBudget {
  const rows = metrics.real.bySource.filter((r) => r.source !== null && r.fit >= MIN_FIT);
  const qualified = rows.reduce((a, r) => a + r.qualified, 0);
  if (rows.length < 2 || qualified < MIN_TOTAL_QUALIFIED) {
    return {
      status: "insufficient",
      kind: "real",
      reason: `Datos insuficientes: se necesitan al menos 2 fuentes con ${MIN_FIT} leads del perfil y ${MIN_TOTAL_QUALIFIED} calificados en total (hay ${rows.length} fuente(s) y ${qualified} calificado(s)).`,
    };
  }
  const arms: Arm[] = rows.map((r) => ({ source: r.source as string, n: r.fit, k: r.qualified, costPerLead: r.fit > 0 ? r.costUsd / r.fit : 0 }));
  const p = probabilityBest(arms, seed);
  const split = splitCents(budgetUsd, p);
  return {
    status: "ok",
    kind: "real",
    budgetUsd,
    samples: SAMPLES,
    allocations: arms.map((a, i) => ({ source: a.source, budgetUsd: split[i], probabilityBest: p[i], n: a.n, k: a.k })).sort((x, y) => y.budgetUsd - x.budgetUsd),
  };
}

export interface SimArm {
  source: string;
  /** assumed true qualified rate per profile lead */
  rate: number;
  /** assumed cost per profile lead (USD) */
  costPerLead: number;
}
export interface SimulationResult {
  /** Not assignable to a real NextBudget. */
  kind: "simulation";
  label: "SIMULACIÓN";
  note: string;
  assumed: SimArm[];
  /** share of each round's leads per source */
  rounds: { round: number; shares: Record<string, number> }[];
  finalShares: Record<string, number>;
}

export const DEFAULT_SIM_ARMS: SimArm[] = [
  { source: "reps", rate: 0.3, costPerLead: 0.6 },
  { source: "osm", rate: 0.12, costPerLead: 0.5 },
  { source: "meta_ads", rate: 0.2, costPerLead: 4 },
];

/** Synthetic episodes with ASSUMED rates. Takes no real data and returns only the simulation type. */
export function simulateBandit(assumed: SimArm[] = DEFAULT_SIM_ARMS, rounds = 12, seed = 7, leadsPerRound = 20): SimulationResult {
  const rng = makeRng(seed);
  const arms: Arm[] = assumed.map((a) => ({ source: a.source, n: 0, k: 0, costPerLead: a.costPerLead }));
  const out: SimulationResult["rounds"] = [];
  for (let r = 1; r <= rounds; r++) {
    const pulls = new Array<number>(arms.length).fill(0);
    for (let j = 0; j < leadsPerRound; j++) {
      const i = pickBest(arms, rng);
      pulls[i]++;
      arms[i].n++;
      if (rng() < assumed[i].rate) arms[i].k++;
    }
    const shares: Record<string, number> = {};
    assumed.forEach((a, i) => (shares[a.source] = pulls[i] / leadsPerRound));
    out.push({ round: r, shares });
  }
  return {
    kind: "simulation",
    label: "SIMULACIÓN",
    note: "Tasas y costos supuestos, no medidos. Muestra cómo aprendería el sistema; no es un resultado real.",
    assumed,
    rounds: out,
    finalShares: out[out.length - 1].shares,
  };
}
