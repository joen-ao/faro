import { describe, expect, it } from "vitest";
import { betaCredibleInterval } from "@/features/metrics/beta";
import type { MetricsRow } from "@/features/metrics/channels";
import { recommendNextBudget, simulateBandit, probabilityBest, makeRng, SAMPLES } from "@/features/bandit";

function row(source: string, fit: number, qualified: number, costUsd: number): MetricsRow {
  return { source, contact: null, found: fit, fit, contacted: fit, opened: 0, responded: qualified, chatted: 0, qualified, costUsd, cpl: fit ? costUsd / fit : null, cplc: qualified ? costUsd / qualified : null, insufficientData: !qualified, qualifiedRate: betaCredibleInterval(qualified, fit) };
}
const m = (rows: MetricsRow[]) => ({ real: { bySource: rows } });
const two = [{ source: "a", n: 10, k: 4, costPerLead: 1 }, { source: "b", n: 10, k: 4, costPerLead: 1 }];

describe("bandit", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    const d = m([row("reps", 40, 20, 20), row("osm", 40, 4, 20)]);
    expect(recommendNextBudget(d, 100, 5)).toEqual(recommendNextBudget(d, 100, 5));
    expect(probabilityBest(two, 1)).not.toEqual(probabilityBest(two, 2));
    expect(makeRng(3)()).toBe(makeRng(3)());
  });

  it("gives the clearly better arm more budget, summing exactly", () => {
    const r = recommendNextBudget(m([row("reps", 50, 25, 25), row("osm", 50, 5, 25), row("meta_ads", 50, 10, 250)]), 100.01, 9);
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.allocations[0].source).toBe("reps");
    expect(r.allocations[0].budgetUsd).toBeGreaterThan(80);
    expect(Math.round(r.allocations.reduce((a, x) => a + x.budgetUsd, 0) * 100)).toBe(10001);
    expect(r.allocations.reduce((a, x) => a + x.probabilityBest, 0)).toBeCloseTo(1, 6);
  });

  it("uses qualified leads within the profile (qualified > fit is clamped, no invalid Beta)", () => {
    const a = { ...row("reps", 6, 6, 3), qualified: 9 };
    const b = row("osm", 40, 8, 10);
    const r = recommendNextBudget(m([a, b]), 100, 4);
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.allocations.every((x) => Number.isFinite(x.probabilityBest) && x.k <= x.n)).toBe(true);
    expect(r.allocations.reduce((s, x) => s + x.probabilityBest, 0)).toBeCloseTo(1, 6);
    const lowQ = { ...row("reps", 40, 1, 10), qualified: 9 }; // 8 qualified fall below the ICP threshold
    expect(recommendNextBudget(m([lowQ, { ...row("osm", 40, 1, 10), qualified: 1 }]), 100).status).toBe("insufficient");
  });

  it("returns no split with insufficient data", () => {
    for (const rows of [[], [row("reps", 40, 10, 10)], [row("reps", 40, 1, 10), row("osm", 40, 1, 10)], [row("reps", 3, 3, 1), row("osm", 40, 5, 10)]]) {
      const r = recommendNextBudget(m(rows), 100);
      expect(r.status).toBe("insufficient");
      expect("allocations" in r).toBe(false);
    }
  });

  it("simulation is labelled, separate from real and learns the best arm", () => {
    const s = simulateBandit();
    expect(s.label).toBe("SIMULACIÓN");
    expect(s.kind).toBe("simulation");
    expect(s.finalShares.reps).toBeGreaterThan(0.5);
    expect(Object.keys(s)).not.toContain("allocations");
    expect(simulateBandit()).toEqual(s);
  });

  it("runs 10,000 samples in under 50 ms", () => {
    const arms = ["a", "b", "c", "d", "e"].map((source, i) => ({ source, n: 30, k: 3 + i, costPerLead: 1 + i }));
    probabilityBest(arms, 1, 500);
    const times = [0, 1, 2, 3, 4].map(() => {
      const t = performance.now();
      probabilityBest(arms, 1, SAMPLES);
      return performance.now() - t;
    });
    expect(Math.min(...times)).toBeLessThan(process.env.PERF ? 50 : 500); // 50 ms target measured with PERF=1; loose bound under the parallel check suite
  });
});
