import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { compare, computeFindings, generateLearnings, groupBy, learningsForProposals, listLearnings, templateStatement, ungroundedNumbers, wilson, type AdPerformance } from "@/features/copilot";
import type { AnthropicAdapter } from "@/integrations/anthropic";
import { createMockAnthropic } from "@/integrations/anthropic";
import { createTestDb } from "../helpers/test-db";

function row(adId: string, angle: string, format: string, impressions: number, linkClicks: number, leads = 0, qualified = 0): AdPerformance {
  return {
    adId, adName: null, campaignId: "c", angle, formatHint: format, hypothesis: null, currency: "COP", spendLocal: 10000, usd: 2.5, frequency: 1, days: 7,
    impressions, linkClicks, leads, qualified,
    ctr: impressions ? linkClicks / impressions : null, ctrInterval: wilson(linkClicks, impressions),
    qualificationRate: leads ? qualified / leads : null, qualificationInterval: wilson(qualified, leads),
    cpl: null, cpql: null, ctrReady: impressions >= 3000, qualityReady: leads >= 20,
  };
}

describe("learning statistics", () => {
  it("labels confidence by sample size and interval separation", () => {
    const strong = groupBy([row("1", "Demo", "demo_pantalla", 8000, 160), row("2", "Dolor", "video_fundador", 8000, 80)], "angle");
    expect(compare(strong, "angle", "ctr")).toMatchObject({ winner: "Demo", runnerUp: "Dolor", confidence: "alta" });
    const mid = groupBy([row("1", "Demo", "x", 4000, 80), row("2", "Dolor", "y", 4000, 30)], "angle");
    expect(compare(mid, "angle", "ctr")!.confidence).toBe("media");
    const close = groupBy([row("1", "Demo", "x", 4000, 44), row("2", "Dolor", "y", 4000, 40)], "angle");
    expect(compare(close, "angle", "ctr")!.confidence).toBe("baja");
    const tiny = groupBy([row("1", "Demo", "x", 500, 20), row("2", "Dolor", "y", 500, 2)], "angle");
    expect(compare(tiny, "angle", "ctr")!.confidence).toBe("insuficiente");
    expect(compare(groupBy([row("1", "Solo", "x", 9000, 90)], "angle"), "angle", "ctr")).toBeNull();
  });

  it("flags numbers a narrative did not get from the evidence", () => {
    const f = computeFindings([row("1", "Demo", "x", 8000, 160), row("2", "Dolor", "y", 8000, 80)]).find((x) => x.id === "angle:ctr")!;
    expect(ungroundedNumbers("Demo tuvo 2,00 % de CTR frente a 1,00 % con 8000 impresiones.", f)).toEqual([]);
    expect(ungroundedNumbers("Demo duplica el CTR: 3,5 % y 40 clientes nuevos.", f)).toEqual(["3,5", "40"]);
    expect(templateStatement(f)).toMatch(/"Demo".*2\.00 %.*"Dolor".*1\.00 %.*alta/);
  });
});

describe("generateLearnings", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    t = await createTestDb();
    const C = "120000000000500";
    await t.db.insert(s.adVariants).values([
      { adId: "1", campaignId: C, briefId: "b", angle: "Demo real", formatHint: "demo_pantalla", hook: "h", primaryText: "t", headline: "h", cta: "LEARN_MORE", hypothesis: "x" },
      { adId: "2", campaignId: C, briefId: "b", angle: "Dolor operativo", formatHint: "video_fundador", hook: "h", primaryText: "t", headline: "h", cta: "LEARN_MORE", hypothesis: "x" },
    ]);
    await t.db.insert(s.adInsights).values([
      { adId: "1", campaignId: C, date: "2026-11-05", currency: "COP", spendLocal: 50000, usd: 12.5, impressions: 8000, linkClicks: 160 },
      { adId: "2", campaignId: C, date: "2026-11-05", currency: "COP", spendLocal: 50000, usd: 12.5, impressions: 8000, linkClicks: 80 },
    ]);
  });
  afterAll(() => t.close());
  const now = new Date("2026-11-09T15:00:00Z");

  it("stores grounded AI statements, replaces older learnings and feeds proposals", async () => {
    const first = await generateLearnings(t.db, createMockAnthropic(), { now });
    expect(first.stored).toBeGreaterThan(0);
    const ctr = (await listLearnings(t.db, false)).find((l) => l.dimension === "angle" && l.metric === "ctr")!;
    expect(ctr).toMatchObject({ winner: "Demo real", confidence: "alta", source: "ai" });
    await generateLearnings(t.db, createMockAnthropic(), { now });
    const all = await t.db.select().from(s.adLearnings);
    expect(all.filter((l) => l.status === "vigente")).toHaveLength(first.stored);
    expect(all.filter((l) => l.status === "reemplazado")).toHaveLength(first.stored);
    expect((await learningsForProposals(t.db, false)).length).toBeGreaterThan(0);
  });

  it("falls back to the template when the model invents numbers", async () => {
    const liar: AnthropicAdapter = {
      model: "liar",
      isMock: true,
      completeRaw: async () => ({ text: JSON.stringify({ learnings: [{ id: "angle:ctr", statement: "Demo real triplica las ventas: 300 % más y 57 clientes." }] }), usage: { input_tokens: 1, output_tokens: 1 } }),
    };
    await generateLearnings(t.db, liar, { now });
    const ctr = (await listLearnings(t.db, false)).find((l) => l.dimension === "angle" && l.metric === "ctr")!;
    expect(ctr.source).toBe("template");
    expect(ctr.statement).not.toMatch(/300|57/);
  });
});
