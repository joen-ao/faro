import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { applyRecommendation, evaluateCopilot, pauseAllFaroCampaigns, revertAction, saveCopilotSettings } from "@/features/copilot";
import { createMockMetaAds, type MetaAdsAdapter } from "@/integrations/meta-ads";
import { parseEnv } from "@/lib/env";
import { createTestDb } from "../helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
afterAll(() => t?.close());

const C = "120000000000700";
const SET = "120000000000701";
const A = "1200000000007011";
const B = "1200000000007012";
const NOW = new Date("2026-11-10T15:00:00Z");
const envOff = parseEnv({ META_COP_PER_USD: "4000" });
const envOn = parseEnv({ META_COP_PER_USD: "4000", ADS_SPEND_ENABLED: "true" });

/** A stateful "real" Meta double: two active ads in one Faro campaign. */
function realDouble() {
  const state = { ads: new Map([[A, "ACTIVE"], [B, "ACTIVE"]]), budget: 40000, campaign: "ACTIVE", calls: [] as string[] };
  const ads: MetaAdsAdapter = {
    ...createMockMetaAds(),
    isMock: false,
    listCampaigns: async () => [{ id: C, name: "Mokub web", status: state.campaign, effectiveStatus: state.campaign, objective: "OUTCOME_TRAFFIC", dailyBudget: state.budget, createdTime: "" }],
    listAdSets: async () => [{ id: SET, name: "set", campaignId: C, status: "ACTIVE", dailyBudget: state.budget }],
    listAds: async () => [...state.ads].map(([id, st]) => ({ id, name: `Anuncio ${id.slice(-1)}`, campaignId: C, adSetId: SET, status: st, effectiveStatus: st })),
    setAdStatus: async (id, st) => {
      state.calls.push(`ad:${id}:${st}`);
      state.ads.set(id, st);
    },
    setAdSetBudget: async (_id, b) => {
      state.calls.push(`budget:${b}`);
      state.budget = b;
    },
    setCampaignStatus: async (_id, st) => {
      state.calls.push(`campaign:${st}`);
      state.campaign = st;
    },
  };
  return { ads, state };
}

async function seed() {
  t = await createTestDb();
  await t.db.insert(s.adVariants).values([A, B].map((adId, i) => ({ adId, campaignId: C, briefId: "b", angle: `Ángulo ${i}`, formatHint: "estatico", hook: "h", primaryText: "t", headline: "h", cta: "LEARN_MORE", hypothesis: "x" })));
  // Ad A burned 3 days of budget without leads -> R-stoploss. Campaign CPQL is terrible -> R-cpql-alto.
  for (const date of ["2026-11-08", "2026-11-09", "2026-11-10"]) {
    await t.db.insert(s.adInsights).values({ adId: A, campaignId: C, date, currency: "COP", spendLocal: 30000, usd: 7.5, impressions: 1500, linkClicks: 15 });
    await t.db.insert(s.adInsights).values({ adId: B, campaignId: C, date, currency: "COP", spendLocal: 40000, usd: 10, impressions: 2000, linkClicks: 30 });
  }
}

describe("evaluateCopilot + applyRecommendation", () => {
  beforeEach(async () => {
    await t?.close();
    await seed();
  });

  it("recommend mode only proposes; autopilot executes spend-lowering actions and logs them", async () => {
    const { ads, state } = realDouble();
    await saveCopilotSettings(t.db, { mode: "recommend", cplCap: 20000, cpqlCap: 50000 });
    const r1 = await evaluateCopilot(t.db, ads, envOff, NOW);
    expect(r1.autoApplied).toBe(0);
    expect(state.calls).toEqual([]);
    const open = await t.db.select().from(s.adRecommendations);
    expect(open.map((r) => r.rule).sort()).toEqual(["R-cpql-alto", "R-stoploss"]);

    // Re-evaluating keeps one open proposal per rule+entity.
    await evaluateCopilot(t.db, ads, envOff, NOW);
    expect(await t.db.select().from(s.adRecommendations)).toHaveLength(2);

    await saveCopilotSettings(t.db, { mode: "autopilot", cplCap: 20000, cpqlCap: 50000 });
    const r2 = await evaluateCopilot(t.db, ads, envOff, NOW);
    expect(r2.autoApplied).toBe(2);
    expect(state.calls).toEqual(expect.arrayContaining([`ad:${A}:PAUSED`, "budget:32000"]));
    const log = await t.db.select().from(s.adActions);
    expect(log.every((a) => a.actor === "autopilot" && a.ok)).toBe(true);
  });

  it("the autopilot never runs approval-only actions; humans need ADS_SPEND_ENABLED to raise spend", async () => {
    const { ads, state } = realDouble();
    const [rec] = await t.db
      .insert(s.adRecommendations)
      .values({ rule: "R-escalar", action: "raise_budget", entityType: "adset", entityId: SET, campaignId: C, title: "Escalar", params: { adSetId: SET, fromBudget: 40000, toBudget: 48000 }, requiresApproval: true })
      .returning();
    expect(await applyRecommendation(t.db, ads, envOn, rec!.id, "autopilot", NOW)).toMatchObject({ ok: false, error: "needs_human" });
    expect(await applyRecommendation(t.db, ads, envOff, rec!.id, "human", NOW)).toMatchObject({ ok: false, error: "spend_disabled" });
    expect(state.calls).toEqual([]);
    expect(await applyRecommendation(t.db, ads, envOn, rec!.id, "human", NOW)).toMatchObject({ ok: true });
    expect(state.budget).toBe(48000);
  });

  it("allows one budget change per campaign every 24 h and expires stale recommendations", async () => {
    const { ads, state } = realDouble();
    const mk = (from: number, to: number) =>
      t.db.insert(s.adRecommendations).values({ rule: "R-cpql-alto", action: "lower_budget", entityType: "adset", entityId: SET, campaignId: C, title: "Bajar", params: { adSetId: SET, fromBudget: from, toBudget: to }, requiresApproval: false }).returning();
    const [r1] = await mk(40000, 32000);
    expect(await applyRecommendation(t.db, ads, envOff, r1!.id, "human", NOW)).toMatchObject({ ok: true });
    const [r2] = await mk(32000, 25600);
    expect(await applyRecommendation(t.db, ads, envOff, r2!.id, "human", new Date(NOW.getTime() + 3_600_000))).toMatchObject({ ok: false, error: "too_soon" });
    const [r3] = await mk(40000, 32000); // budget is 32000 now: the recommendation no longer matches reality
    expect(await applyRecommendation(t.db, ads, envOff, r3!.id, "human", new Date(NOW.getTime() + 25 * 3_600_000))).toMatchObject({ ok: false, error: "stale" });
    expect(state.budget).toBe(32000);
  });

  it("revert is human-only and guarded; panic pauses every Faro campaign", async () => {
    const { ads, state } = realDouble();
    const [rec] = await t.db.insert(s.adRecommendations).values({ rule: "R-stoploss", action: "pause_ad", entityType: "ad", entityId: A, campaignId: C, title: "Pausar", requiresApproval: false }).returning();
    const applied = await applyRecommendation(t.db, ads, envOff, rec!.id, "autopilot", NOW);
    expect(applied.ok).toBe(true);
    const actionId = (applied as { actionId: string }).actionId;
    expect(await revertAction(t.db, ads, envOff, actionId, NOW)).toMatchObject({ ok: false, error: "spend_disabled" });
    expect(await revertAction(t.db, ads, envOn, actionId, NOW)).toMatchObject({ ok: true });
    expect(state.ads.get(A)).toBe("ACTIVE");
    expect(await revertAction(t.db, ads, envOn, actionId, NOW)).toMatchObject({ ok: false, error: "already_reverted" });

    expect(await pauseAllFaroCampaigns(t.db, ads, NOW)).toEqual({ paused: 1, failed: 0 });
    expect(state.campaign).toBe("PAUSED");
    const panic = await t.db.select().from(s.adActions).where(eq(s.adActions.action, "pause_campaign"));
    expect(panic).toHaveLength(1);
  });
});
