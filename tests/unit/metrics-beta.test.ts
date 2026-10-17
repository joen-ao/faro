import { describe, expect, it } from "vitest";
import { betaCdf, betaCredibleInterval, betaQuantile } from "@/features/metrics";

describe("beta", () => {
  it("CDF matches closed forms", () => {
    expect(betaCdf(0.3, 1, 1)).toBeCloseTo(0.3, 10); // uniform
    expect(betaCdf(0.5, 2, 2)).toBeCloseTo(0.5, 10); // symmetric
    expect(betaCdf(0.25, 2, 1)).toBeCloseTo(0.0625, 10); // x^2
    expect(betaCdf(0, 3, 4)).toBe(0);
    expect(betaCdf(1, 3, 4)).toBe(1);
  });

  it("quantile inverts the CDF", () => {
    for (const [p, a, b] of [[0.05, 1, 11], [0.95, 3, 8], [0.5, 10, 2]] as const) {
      expect(betaCdf(betaQuantile(p, a, b), a, b)).toBeCloseTo(p, 8);
    }
    expect(betaQuantile(0, 2, 2)).toBe(0);
    expect(betaQuantile(1, 2, 2)).toBe(1);
  });

  it("k=0, n=10 gives about [0.005, 0.24]", () => {
    const ci = betaCredibleInterval(0, 10);
    expect(ci.lo).toBeCloseTo(1 - 0.95 ** (1 / 11), 6); // 0.00466
    expect(ci.hi).toBeCloseTo(1 - 0.05 ** (1 / 11), 6); // 0.2384
    expect(ci.hi).toBeGreaterThan(0.23);
    expect(ci.hi).toBeLessThan(0.25);
    expect(ci.mean).toBeCloseTo(1 / 12, 10);
  });

  it("no data gives the prior [0.05, 0.95]; n=100,k=50 is tight around 0.5", () => {
    const prior = betaCredibleInterval(0, 0);
    expect(prior.lo).toBeCloseTo(0.05, 6);
    expect(prior.hi).toBeCloseTo(0.95, 6);
    const ci = betaCredibleInterval(50, 100);
    expect(ci.lo).toBeCloseTo(0.4181, 3);
    expect(ci.hi).toBeCloseTo(0.5819, 3);
  });

  it("rejects invalid counts", () => {
    expect(() => betaCredibleInterval(3, 2)).toThrow(RangeError);
    expect(() => betaCredibleInterval(-1, 2)).toThrow(RangeError);
  });
});
