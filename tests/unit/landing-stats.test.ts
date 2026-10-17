import { describe, expect, it } from "vitest";
import { buildLandingStats, formatCount, formatUsd } from "@/features/metrics/landing";
import type { PublicMetrics } from "@/features/metrics/public";

const base: PublicMetrics = {
  hasData: true,
  leadsFound: 120,
  leadsFit: 40,
  contacted: 10,
  qualified: 3,
  totalCostUsd: 12,
  cpl: 0.3,
  cplc: 4,
  bySource: [],
  paidVsFree: { paid: { fit: 5, costUsd: 10, cpl: 2 }, free: { fit: 35, costUsd: 2, cpl: 0.0571 } },
};

describe("buildLandingStats", () => {
  it("is empty when the API failed", () => {
    expect(buildLandingStats(null)).toEqual({ state: "empty" });
  });
  it("is empty when there is no real data", () => {
    expect(buildLandingStats({ ...base, hasData: false, leadsFound: 0 })).toEqual({ state: "empty" });
  });
  it("computes the free vs paid ratio only with both CPLs", () => {
    const s = buildLandingStats(base);
    expect(s.state).toBe("ready");
    if (s.state === "ready") expect(s.freeVsPaidRatio).toBeCloseTo(35.02, 1);
  });
  it("has no ratio without paid spend or with a zero free cost", () => {
    const noPaid = buildLandingStats({ ...base, paidVsFree: { paid: { fit: 0, costUsd: 0, cpl: null }, free: base.paidVsFree.free } });
    const zeroFree = buildLandingStats({ ...base, paidVsFree: { paid: base.paidVsFree.paid, free: { fit: 4, costUsd: 0, cpl: 0 } } });
    for (const s of [noPaid, zeroFree]) {
      expect(s.state).toBe("ready");
      if (s.state === "ready") expect(s.freeVsPaidRatio).toBeNull();
    }
  });
  it("formats money and counts in es-CO", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(1.5)).toContain("1,50");
    expect(formatCount(12345)).toMatch(/12\.345/);
  });
});
