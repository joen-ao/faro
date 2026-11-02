import { describe, expect, it } from "vitest";
import { evaluateRules, wilson, type AdPerformance, type RuleContext } from "@/features/copilot";
import type { MetaAd } from "@/integrations/meta-ads";

const NOW = new Date("2026-11-10T12:00:00Z");
const C = "120000000000900";

function perf(adId: string, p: Partial<AdPerformance>): AdPerformance {
  const impressions = p.impressions ?? 0;
  const linkClicks = p.linkClicks ?? 0;
  const leads = p.leads ?? 0;
  const qualified = p.qualified ?? 0;
  const spend = p.spendLocal ?? 0;
  return {
    adId, adName: null, campaignId: C, angle: null, formatHint: null, hypothesis: null, currency: "COP", usd: 0, frequency: 1, days: 3,
    spendLocal: spend, impressions, linkClicks, leads, qualified,
    ctr: impressions ? linkClicks / impressions : null, ctrInterval: wilson(linkClicks, impressions),
    qualificationRate: leads ? qualified / leads : null, qualificationInterval: wilson(qualified, leads),
    cpl: leads ? spend / leads : null, cpql: qualified ? spend / qualified : null, ctrReady: impressions >= 3000, qualityReady: leads >= 20,
    ...p,
  };
}
const ad = (id: string, status = "ACTIVE"): MetaAd => ({ id, name: `Anuncio ${id.slice(-1)}`, campaignId: C, adSetId: "120000000000901", status, effectiveStatus: status });

function ctx(over: Partial<RuleContext> & { d3?: AdPerformance[]; d7?: AdPerformance[]; prev7?: AdPerformance[]; d14?: AdPerformance[] } = {}): RuleContext {
  const m = (rows?: AdPerformance[]) => new Map((rows ?? []).map((r) => [r.adId, r]));
  return {
    settings: { mode: "recommend", cplCap: 20000, cpqlCap: 100000 },
    maxBudget: 50000,
    minBudget: 20000,
    campaigns: [{ id: C, name: "Mokub web", status: "ACTIVE", effectiveStatus: "ACTIVE", objective: "OUTCOME_TRAFFIC", dailyBudget: 40000, createdTime: "" }],
    adSets: [{ id: "120000000000901", name: "set", campaignId: C, status: "ACTIVE", dailyBudget: 40000 }],
    ads: [ad("1200000000009011"), ad("1200000000009012"), ad("1200000000009013")],
    faroCampaignIds: new Set([C]),
    perf: { d3: m(over.d3), d7: m(over.d7), prev7: m(over.prev7), d14: m(over.d14) },
    lastBudgetChange: new Map(),
    now: NOW,
    ...over,
  };
}
const rules = (c: RuleContext) => evaluateRules(c).proposals.map((p) => `${p.rule}:${p.entityId}`);
const A = "1200000000009011";
const B = "1200000000009012";

describe("R-stoploss (3 days, spend >= 2x CPL target, 0 leads)", () => {
  it("fires at the threshold and not just below it", () => {
    expect(rules(ctx({ d3: [perf(A, { spendLocal: 40000, leads: 0, days: 3 })] }))).toContain(`R-stoploss:${A}`);
    expect(rules(ctx({ d3: [perf(A, { spendLocal: 39999, leads: 0, days: 3 })] }))).not.toContain(`R-stoploss:${A}`);
    expect(rules(ctx({ d3: [perf(A, { spendLocal: 40000, leads: 0, days: 2 })] }))).not.toContain(`R-stoploss:${A}`);
    expect(rules(ctx({ d3: [perf(A, { spendLocal: 40000, leads: 1, days: 3 })] }))).not.toContain(`R-stoploss:${A}`);
  });
  it("is skipped without a CPL target and never pauses the last active ad", () => {
    const noCap = evaluateRules(ctx({ settings: { mode: "recommend", cplCap: null, cpqlCap: null }, d3: [perf(A, { spendLocal: 99999, days: 3 })] }));
    expect(noCap.proposals).toHaveLength(0);
    expect(noCap.skipped.length).toBe(2);
    const lonely = ctx({ ads: [ad(A), ad(B, "PAUSED")], d3: [perf(A, { spendLocal: 99999, days: 3 })] });
    expect(rules(lonely)).not.toContain(`R-stoploss:${A}`);
  });
});

describe("R-calidad (14 days, spend >= 2x CPQL target, 0 qualified)", () => {
  it("fires at the threshold only", () => {
    expect(rules(ctx({ d14: [perf(A, { spendLocal: 200000, leads: 4, qualified: 0 })] }))).toContain(`R-calidad:${A}`);
    expect(rules(ctx({ d14: [perf(A, { spendLocal: 199999, leads: 4, qualified: 0 })] }))).not.toContain(`R-calidad:${A}`);
    expect(rules(ctx({ d14: [perf(A, { spendLocal: 300000, leads: 4, qualified: 1 })] }))).not.toContain(`R-calidad:${A}`);
  });
});

describe("R-ctr (loser vs leader, >= 5.000 impressions, Wilson)", () => {
  it("pauses a clear loser and spares an ad with qualified leads or too few impressions", () => {
    const leader = perf(B, { impressions: 8000, linkClicks: 160 }); // 2 %
    expect(rules(ctx({ d14: [leader, perf(A, { impressions: 6000, linkClicks: 30 })] }))).toContain(`R-ctr:${A}`); // 0.5 %
    expect(rules(ctx({ d14: [leader, perf(A, { impressions: 4999, linkClicks: 10 })] }))).not.toContain(`R-ctr:${A}`);
    expect(rules(ctx({ d14: [leader, perf(A, { impressions: 6000, linkClicks: 30, qualified: 1, leads: 2 })] }))).not.toContain(`R-ctr:${A}`);
    expect(rules(ctx({ d14: [leader, perf(A, { impressions: 6000, linkClicks: 66 })] }))).not.toContain(`R-ctr:${A}`); // 1.1 % > 50 % of leader
  });
});

describe("R-fatiga and R-rechazo (alerts only)", () => {
  it("alerts on high frequency with a CTR drop of 20 %", () => {
    const now7 = perf(A, { impressions: 2000, linkClicks: 16, frequency: 3.2 }); // 0.8 %
    expect(rules(ctx({ d7: [now7], prev7: [perf(A, { impressions: 2000, linkClicks: 20 })] }))).toContain(`R-fatiga:${A}`); // 1.0 % -> 0.8 %
    expect(rules(ctx({ d7: [now7], prev7: [perf(A, { impressions: 2000, linkClicks: 19 })] }))).not.toContain(`R-fatiga:${A}`);
    expect(rules(ctx({ d7: [{ ...now7, frequency: 3 }], prev7: [perf(A, { impressions: 2000, linkClicks: 20 })] }))).not.toContain(`R-fatiga:${A}`);
  });
  it("alerts on disapproved ads", () => {
    const p = evaluateRules(ctx({ ads: [ad(A, "DISAPPROVED"), ad(B)] })).proposals;
    expect(p).toContainEqual(expect.objectContaining({ rule: "R-rechazo", action: "alert", requiresApproval: false }));
  });
});

describe("budget rules", () => {
  const spend = (s: number, q: number) => [perf(A, { spendLocal: s / 2, qualified: Math.ceil(q / 2), leads: q * 2 }), perf(B, { spendLocal: s / 2, qualified: Math.floor(q / 2), leads: q * 2 })];
  it("R-cpql-alto lowers 20 % (never below 20.000) and runs automatically", () => {
    const p = evaluateRules(ctx({ d7: spend(200000, 1) })).proposals.find((x) => x.rule === "R-cpql-alto")!;
    expect(p).toMatchObject({ action: "lower_budget", requiresApproval: false, params: { fromBudget: 40000, toBudget: 32000 } });
    const floor = evaluateRules(ctx({ adSets: [{ id: "120000000000901", name: "s", campaignId: C, status: "ACTIVE", dailyBudget: 20000 }], d7: spend(200000, 0) })).proposals;
    expect(floor.find((x) => x.rule === "R-cpql-alto")).toBeUndefined();
  });
  it("R-escalar needs >= 5 qualified in 14 days, CPQL under target, 7 days since last change, and approval", () => {
    const good = ctx({ d7: spend(150000, 3), d14: spend(300000, 5) });
    const p = evaluateRules(good).proposals.find((x) => x.rule === "R-escalar")!;
    expect(p).toMatchObject({ action: "raise_budget", requiresApproval: true, params: { fromBudget: 40000, toBudget: 48000 } });
    expect(evaluateRules(ctx({ d7: spend(150000, 3), d14: spend(300000, 4) })).proposals.find((x) => x.rule === "R-escalar")).toBeUndefined();
    expect(evaluateRules({ ...good, lastBudgetChange: new Map([[C, new Date(NOW.getTime() - 6 * 86_400_000)]]) }).proposals.find((x) => x.rule === "R-escalar")).toBeUndefined();
  });
  it("R-activar proposes (with approval) a new paused Faro campaign; ignores campaigns Faro did not create", () => {
    const paused = { campaigns: [{ id: C, name: "Mokub web", status: "PAUSED", effectiveStatus: "PAUSED", objective: "", dailyBudget: 40000, createdTime: "" }] };
    expect(evaluateRules(ctx(paused)).proposals).toContainEqual(expect.objectContaining({ rule: "R-activar", requiresApproval: true }));
    expect(evaluateRules(ctx({ ...paused, faroCampaignIds: new Set() })).proposals).toHaveLength(0);
  });
});
