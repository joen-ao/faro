import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { AppDb } from "@/db/types";
import {
  bogotaWeek,
  buildGroup,
  buildVerdict,
  computeBusinessMetrics,
  MIN_DIRECTIONAL,
  MIN_FORMAL,
  parseRange,
  trendWeeks,
  type BusinessMetrics,
} from "@/features/dashboard/business";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-02T15:00:00Z"); // Monday 10:00 in Bogotá
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * 86_400_000 + hours * 3_600_000);

let conn: Awaited<ReturnType<typeof createTestDb>>;
let db: AppDb;
let m: BusinessMetrics;
let i = 0;

async function lead(source: "meta_ads" | "osm", createdAt: Date, opts: { fit?: number; demo?: boolean } = {}) {
  i++;
  const [co] = await db.insert(s.companies).values({ name: `Co ${i} SAS`, normalizedName: `co ${i}`, isDemo: opts.demo ?? false }).returning();
  const [l] = await db
    .insert(s.leads)
    .values({ companyId: co.id, primarySource: source, slug: `f31-${i}`, fitScore: opts.fit ?? null, isDemo: opts.demo ?? false, createdAt })
    .returning();
  return l.id;
}

beforeAll(async () => {
  conn = await createTestDb();
  db = conn.db as unknown as AppDb;
  // Meta: 3 real leads in the period, 1 demo (excluded), 1 in the previous period.
  const m1 = await lead("meta_ads", ago(2), { fit: 80 });
  const m2 = await lead("meta_ads", ago(3), { fit: 80 });
  const m3 = await lead("meta_ads", ago(4));
  const mDemo = await lead("meta_ads", ago(2), { demo: true });
  const mPrev = await lead("meta_ads", ago(40));
  // Faro: two old osm leads first contacted 5 days ago, one found in the period (not contacted), one with a mock message only.
  const f1 = await lead("osm", ago(70), { fit: 90 });
  const f2 = await lead("osm", ago(70), { fit: 90 });
  await lead("osm", ago(1), { fit: 90 });
  const fMock = await lead("osm", ago(70));

  await db.insert(s.messages).values([
    { leadId: f1, contactChannel: "email", body: "x", status: "sent", sentAt: ago(5) },
    { leadId: f2, contactChannel: "email", body: "x", status: "sent", sentAt: ago(5) },
    { leadId: fMock, contactChannel: "email", body: "x", status: "sent", sentAt: ago(5), isMock: true },
  ]);
  await db.insert(s.events).values([
    { leadId: m1, type: "form_submit", at: ago(2) }, // arrival, not a response for Meta
    { leadId: m1, type: "reply", at: ago(2, 2) },
    { leadId: f1, type: "reply", at: ago(5, 10) },
    { leadId: f2, type: "reply", at: ago(5, 1), isMock: true },
    { leadId: mDemo, type: "reply", at: ago(2, 1), isDemo: true },
  ]);
  await db.insert(s.qualifications).values([
    { leadId: m1, origin: "dapta", qualified: true, createdAt: ago(1) },
    { leadId: m2, origin: "dapta", qualified: false, createdAt: ago(1) },
    { leadId: m3, origin: "fallback", qualified: true, isMock: true, createdAt: ago(1) },
    { leadId: mDemo, origin: "dapta", qualified: true, isDemo: true, createdAt: ago(1) },
    { leadId: f1, origin: "dapta", qualified: true, createdAt: ago(1) },
    { leadId: mPrev, origin: "dapta", qualified: true, createdAt: ago(39) },
  ]);
  const c = { category: "ads" as const, unit: "u", quantity: 1 };
  await db.insert(s.costEntries).values([
    { ...c, leadId: m1, sourceChannel: "meta_ads", usd: 30, at: ago(3) },
    { ...c, category: "data", sourceChannel: "osm", usd: 2, at: ago(3) },
    { ...c, sourceChannel: "meta_ads", usd: 100, isMock: true, at: ago(3) },
    { ...c, sourceChannel: "meta_ads", usd: 50, isDemo: true, at: ago(3) },
    { ...c, leadId: mDemo, sourceChannel: "meta_ads", usd: 7, at: ago(3) }, // real-flagged cost on a demo lead
    { ...c, sourceChannel: "meta_ads", usd: 10, at: ago(40) },
  ]);
  await db.insert(s.adSpend).values([
    { platform: "meta", campaign: "c1", date: "2026-10-30", usd: 30, clicks: 120 },
    { platform: "meta", campaign: "c1", date: "2026-10-30", usd: 5, clicks: 999, isDemo: true },
    { platform: "meta", campaign: "c1", date: "2026-08-01", usd: 5, clicks: 50 },
  ]);
  m = await computeBusinessMetrics(db, { rangeDays: 30, now: NOW });
});
afterAll(() => conn.close());

describe("period KPIs and deltas", () => {
  it("counts real rows only, current vs previous period", () => {
    const k = m.kpis;
    expect(k.newLeads.value).toBe(4);
    expect(k.newLeads.prev).toBe(1);
    expect(k.newLeads.delta).toBeCloseTo(3);
    expect(k.spend.value).toBeCloseTo(32);
    expect(k.spend.prev).toBeCloseTo(10);
    expect(k.qualified.value).toBe(2);
    expect(k.qualified.prev).toBe(1);
    expect(k.cpql.value).toBeCloseTo(16);
    expect(k.cpql.prev).toBeCloseTo(10);
    expect(k.cpql.delta).toBeCloseTo(0.6);
    expect(k.cpql.lowSample).toBe(true);
    expect(k.cpl.value).toBeCloseTo(8);
    expect(k.rate.value).toBeCloseTo(2 / 3);
    expect(k.rate.n).toBe(3);
    expect(k.rate.delta).toBeCloseTo(2 / 3 - 1); // absolute points
    expect(k.rate.interval!.low).toBeLessThan(2 / 3);
    expect(k.rate.interval!.high).toBeGreaterThan(2 / 3);
    expect(k.rate.lowSample).toBe(true);
  });

  it("weekly sparkline series sum to the in-window totals", () => {
    expect(m.weeks.length).toBeGreaterThanOrEqual(4);
    expect(m.kpis.qualified.series.reduce<number>((a, v) => a + (v ?? 0), 0)).toBe(2);
    expect(m.kpis.spend.series.reduce<number>((a, v) => a + (v ?? 0), 0)).toBeCloseTo(32);
    expect(m.kpis.newLeads.series).toHaveLength(m.weeks.length);
  });
});

describe("Meta vs. Faro", () => {
  it("uses the F13 rules (no demo, no mock) per group", () => {
    const { meta, faro } = m.groups;
    expect(meta).toMatchObject({ leads: 3, reach: 120, responded: 1, qualified: 1 });
    expect(meta.spendUsd).toBeCloseTo(30);
    expect(meta.cpql).toBeCloseTo(30);
    expect(meta.cpl).toBeCloseTo(10);
    expect(meta.medianHoursToResponse).toBeCloseTo(2);
    expect(faro).toMatchObject({ leads: 2, reach: 2, responded: 1, qualified: 1 });
    expect(faro.spendUsd).toBeCloseTo(2);
    expect(faro.medianHoursToResponse).toBeCloseTo(10);
    expect(faro.rate).toBeCloseTo(0.5);
    expect(m.verdict.kind).toBe("insufficient");
    expect(m.verdict.text).toMatch(/Datos insuficientes/);
  });

  it("weekly trend is a cohort by entry week", () => {
    const sum = (g: "meta" | "faro", k: "leads" | "qualified") => m.trend.reduce((a, t) => a + t[g][k], 0);
    expect(sum("meta", "leads")).toBe(3);
    expect(sum("meta", "qualified")).toBe(1);
    expect(sum("faro", "leads")).toBe(2);
    expect(sum("faro", "qualified")).toBe(1);
  });

  it("funnel by group: creation cohort with step rates", () => {
    const v = (g: "meta" | "faro") => Object.fromEntries(m.funnel[g].map((s) => [s.key, s.value]));
    expect(v("meta")).toEqual({ found: 3, fit: 2, contacted: 3, responded: 1, qualified: 1 });
    expect(v("faro")).toEqual({ found: 1, fit: 1, contacted: 0, responded: 0, qualified: 0 });
    expect(m.funnel.meta[0].stepRate).toBeNull();
    expect(m.funnel.meta[1].stepRate).toBeCloseTo(2 / 3);
    expect(m.funnel.faro[3].stepRate).toBeNull(); // previous step is 0
  });
});

describe("verdict thresholds", () => {
  const g = (group: "meta" | "faro", n: number, q: number, spend: number) => buildGroup(group, { grp: group, n, responded: q, qualified: q, median_h: null }, spend, 0);

  it("needs MIN_DIRECTIONAL leads per side", () => {
    expect(buildVerdict(g("meta", MIN_DIRECTIONAL - 1, 5, 100), g("faro", 500, 5, 1)).kind).toBe("insufficient");
    expect(buildVerdict(g("meta", MIN_DIRECTIONAL, 5, 100), g("faro", MIN_DIRECTIONAL, 5, 10)).kind).toBe("winner");
  });

  it("directional (low) below MIN_FORMAL, medium/high above depending on interval overlap", () => {
    const low = buildVerdict(g("meta", 30, 3, 90), g("faro", 30, 6, 12));
    expect(low).toMatchObject({ kind: "winner", winner: "faro", confidence: "baja" });
    expect(low.text).toMatch(/^Faro rinde mejor/);
    const medium = buildVerdict(g("meta", MIN_FORMAL, 10, 300), g("faro", MIN_FORMAL, 12, 60));
    expect(medium).toMatchObject({ winner: "faro", confidence: "media" });
    const high = buildVerdict(g("meta", 200, 60, 600), g("faro", 200, 10, 600));
    expect(high).toMatchObject({ winner: "meta", confidence: "alta" });
  });

  it("ties within 10 % and handles a side without qualified leads", () => {
    expect(buildVerdict(g("meta", 50, 10, 100), g("faro", 50, 10, 105)).kind).toBe("tie");
    expect(buildVerdict(g("meta", 50, 0, 100), g("faro", 50, 0, 1)).kind).toBe("insufficient");
    const v = buildVerdict(g("meta", 50, 0, 100), g("faro", 50, 2, 40));
    expect(v).toMatchObject({ kind: "winner", winner: "faro" });
    expect(v.text).toContain("Meta sin calificados");
  });
});

describe("helpers", () => {
  it("ranges and Bogotá weeks", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange("45")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
    expect(bogotaWeek(new Date("2026-11-02T03:00:00Z"))).toBe("2026-10-26"); // Sunday 22:00 in Bogotá
    expect(bogotaWeek(new Date("2026-11-02T06:00:00Z"))).toBe("2026-11-02");
    const w = trendWeeks(NOW, 90);
    expect(w.at(-1)).toBe("2026-11-02");
    expect(w.length).toBeGreaterThanOrEqual(13);
  });
});
