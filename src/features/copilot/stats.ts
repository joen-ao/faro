/** F29 · Small-sample statistics used to decide whether an ad metric is readable (playbook cap. 7). */

export interface Interval {
  low: number;
  high: number;
}

/** Wilson score interval for a proportion (z = 1.96 → 95 %). Returns null when n = 0. */
export function wilson(successes: number, n: number, z = 1.96): Interval | null {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/** Minimum data before a metric is shown as readable (playbook cap. 3 "Qué medir"). */
export const MIN_DATA = {
  /** CTR comparisons: 3.000–8.000 impressions per ad. */
  ctrImpressions: 3000,
  /** Lead quality: directional from 20 leads (Bayesian); formal tests need ~78 per arm. */
  qualityLeads: 20,
} as const;
