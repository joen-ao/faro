import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FiguresBand } from "@/components/landing/figures";
import { PaidVsFree } from "@/components/landing/paid-vs-free";
import { buildLandingStats, describeComparison, formatCount, formatUsd } from "@/features/metrics/landing";
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
  it("describes the comparison coherently, incl. free CPL = 0 and parity", () => {
    const ready = (paid: PublicMetrics["paidVsFree"]["paid"], free: PublicMetrics["paidVsFree"]["free"]) => {
      const s = buildLandingStats({ ...base, paidVsFree: { paid, free } });
      if (s.state !== "ready") throw new Error("expected ready");
      return describeComparison(s);
    };
    expect(ready({ fit: 5, costUsd: 10, cpl: 2 }, { fit: 4, costUsd: 0, cpl: 0 })).toBe("Las fuentes gratuitas no tuvieron costo atribuido; la pauta costó USD 2,00 por lead.");
    expect(ready({ fit: 0, costUsd: 0, cpl: null }, { fit: 4, costUsd: 0, cpl: 0 })).toContain("Aún no hay pauta registrada");
    expect(ready({ fit: 5, costUsd: 10, cpl: 2 }, { fit: 5, costUsd: 10, cpl: 2 })).toContain("lo mismo");
    expect(ready({ fit: 5, costUsd: 10, cpl: 2 }, { fit: 35, costUsd: 2, cpl: 0.0571 })).toContain("35,0 veces menos");
    expect(ready({ fit: 5, costUsd: 10, cpl: 1 }, { fit: 5, costUsd: 10, cpl: 2 })).toContain("2,0 veces más");
    expect(ready({ fit: 0, costUsd: 0, cpl: null }, { fit: 5, costUsd: 10, cpl: 2 })).toContain("Aún no hay datos suficientes");
  });
  it("renders the ready state with valid dl order (dt before dd) and es-CO numbers", () => {
    const stats = buildLandingStats({ ...base, leadsFound: 12345 });
    const bySource = [
      { source: "osm", fit: 30, costUsd: 1.5, cpl: 0.05, free: true },
      { source: "meta_ads", fit: 5, costUsd: 10, cpl: 2, free: false },
    ];
    const html = renderToStaticMarkup(createElement(PaidVsFree, { stats, bySource }));
    expect(html).toContain('data-testid="metrics-ready"');
    expect(html).not.toContain("metrics-empty");
    expect(html).toContain("veces menos");
    expect(html).toContain("OpenStreetMap");
    expect(html.indexOf("<dt")).toBeLessThan(html.indexOf("<dd"));
    expect(html.match(/<dt/g)?.length).toBe(html.match(/<dd/g)?.length);

    const band = renderToStaticMarkup(
      createElement(FiguresBand, {
        data: { stats, cpl: 0.3, bySource, mergedDuplicates: 8, excludedPersons: 35, naturalPersonsContacted: 0, sites: null, sendWindow: { policy: "ley2300" } },
      }),
    );
    expect(band).toContain("12.345");
    expect(band).toContain("8 duplicados fusionados");
    expect(band.indexOf("<dt")).toBeLessThan(band.indexOf("<dd"));
  });
  it("renders honest empty figures without invented numbers", () => {
    const band = renderToStaticMarkup(
      createElement(FiguresBand, {
        data: { stats: buildLandingStats(null), cpl: null, bySource: [], mergedDuplicates: null, excludedPersons: null, naturalPersonsContacted: null, sites: null, sendWindow: { policy: "ley2300" } },
      }),
    );
    expect(band).toContain("Sin datos aún");
    expect(band).not.toMatch(/\d+ duplicados/);
  });
  it("renders the honest empty state", () => {
    const html = renderToStaticMarkup(createElement(PaidVsFree, { stats: buildLandingStats(null) }));
    expect(html).toContain("Aún no hay datos del evento");
  });
  it("formats money and counts in es-CO", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(1.5)).toContain("1,50");
    expect(formatCount(12345)).toMatch(/12\.345/);
  });
});
