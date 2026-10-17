import { describe, expect, it } from "vitest";
import { betaCredibleInterval } from "@/features/metrics/beta";
import type { MetricsBucket, MetricsRow } from "@/features/metrics/channels";
import { getCellLeads, getDashboardData } from "@/features/dashboard/data";
import { getDemoDb } from "@/features/dashboard/demo-db";
import { fmtInterval, fmtPct, fmtUsd } from "@/features/dashboard/format";
import { buildRecommendation, splitPaidVsFree } from "@/features/dashboard/recommendation";
import { createTestDb } from "../helpers/test-db";

function row(source: string, fit: number, qualified: number, costUsd: number): MetricsRow {
  return {
    source,
    contact: null,
    found: fit + 3,
    fit,
    contacted: fit,
    responded: qualified,
    qualified,
    costUsd,
    cpl: fit ? costUsd / fit : null,
    cplc: qualified ? costUsd / qualified : null,
    insufficientData: qualified === 0,
    qualifiedRate: betaCredibleInterval(qualified, fit),
  };
}
function bucket(rows: MetricsRow[]): MetricsBucket {
  const sum = (k: "fit" | "qualified" | "costUsd") => rows.reduce((a, r) => a + r[k], 0);
  return { excludedMockUsd: 0, excludedDemoUsd: 0, bySource: rows, byContact: [], cells: [], totals: row("x", sum("fit"), sum("qualified"), sum("costUsd")), unattributedUsd: 0 };
}

describe("buildRecommendation", () => {
  it("names a clear winner with CPL/CPLC numbers", () => {
    const r = buildRecommendation({ real: bucket([row("reps", 20, 5, 4), row("meta_ads", 10, 2, 40), row("osm", 15, 1, 6)]) });
    expect(r.kind).toBe("winner");
    expect(r.sources).toEqual(["reps"]);
    expect(r.text).toContain("Conviene buscar en REPS");
    expect(r.text).toContain("CPLC $0.800 vs $6.00");
  });
  it("reports a technical tie when CPLC is within 10 %", () => {
    const r = buildRecommendation({ real: bucket([row("reps", 20, 5, 4), row("rues", 20, 5, 4.2)]) });
    expect(r.kind).toBe("tie");
    expect(r.sources).toHaveLength(2);
  });
  it("says data is insufficient (no qualified, tiny samples, or empty)", () => {
    for (const rows of [[], [row("reps", 3, 1, 1), row("rues", 2, 0, 1)], [row("reps", 20, 0, 4), row("rues", 20, 0, 4)], [row("reps", 20, 4, 4), row("rues", 20, 0, 4)]]) {
      const r = buildRecommendation({ real: bucket(rows) });
      expect(r.kind).toBe("insufficient");
      expect(r.text).toMatch(/Datos insuficientes/);
      expect(r.sources).toEqual([]);
    }
  });
  it("never recommends from demo data", () => {
    const demo = bucket([row("reps", 20, 5, 4), row("osm", 15, 1, 6)]);
    const r = buildRecommendation({ real: bucket([]), demo });
    expect(r.kind).toBe("demo_only");
    expect(r.text).toMatch(/DEMO/);
    expect(r.sources).toEqual([]);
  });
});

describe("formatting and splits", () => {
  it("formats USD, percentages and intervals", () => {
    expect(fmtUsd(0.0667)).toBe("$0.067");
    expect(fmtUsd(7.6)).toBe("$7.60");
    expect(fmtUsd(1204.4)).toBe("$1,204");
    expect(fmtUsd(null)).toBe("—");
    expect(fmtPct(0.125)).toBe("12,5 %");
    expect(fmtPct(null)).toBe("—");
    expect(fmtInterval({ lo: 0.005, hi: 0.24 })).toBe("IC 90 %: 0,5 % a 24 %");
  });
  it("splits meta_ads from the free sources", () => {
    const s = splitPaidVsFree([row("meta_ads", 10, 2, 40), row("reps", 10, 2, 2), row("osm", 10, 0, 2)]);
    expect(s.paid?.cplc).toBe(20);
    expect(s.free.fit).toBe(20);
    expect(s.free.cplc).toBe(2);
  });
});

describe("dashboard data", () => {
  it("toggle off excludes demo: real stays empty and demo is null", async () => {
    const db = await getDemoDb(); // a DB that only contains demo rows
    const off = await getDashboardData(db, { includeDemo: false });
    expect(off.demo).toBeNull();
    expect(off.real.totals.found).toBe(0);
    expect(off.real.totals.costUsd).toBe(0);
    expect(buildRecommendation(off).kind).toBe("insufficient");
  });
  it("toggle on keeps demo in its own bucket, not summed into real", async () => {
    const on = await getDashboardData(await getDemoDb(), { includeDemo: true });
    expect(on.real.totals.found).toBe(0);
    expect(on.demo?.totals.found).toBeGreaterThan(50);
    expect(on.demo?.bySource.map((r) => r.source)).toContain("meta_ads");
  });
  it("falls back to the ephemeral demo dataset when the real DB has no demo rows", async () => {
    const conn = await createTestDb();
    try {
      const d = await getDashboardData(conn.db as never, { includeDemo: true });
      expect(d.real.totals.found).toBe(0);
      expect(d.demo?.totals.found).toBeGreaterThan(50);
      expect(d.compliance.naturalPersonsContacted).toBe(0);
    } finally {
      await conn.close();
    }
  });
  it("cell detail returns leads with receipts that match their cost", async () => {
    const db = await getDemoDb();
    const { total, leads } = await getCellLeads(db, { source: "reps", contact: "email", demo: true });
    expect(total).toBeGreaterThan(0);
    for (const l of leads) {
      expect(l.receipt).not.toBeNull();
      expect(l.receipt!.totalUsd).toBeCloseTo(l.costUsd, 5);
    }
    expect((await getCellLeads(db, { source: "reps", contact: "email", demo: false })).total).toBe(0);
  });
});
