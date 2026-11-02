import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { activationRefusal, bogotaDate, campaignInputSchema, destinationError, getLastSync, metaCampaignStats, syncMetaAds } from "@/features/ads";
import { recordContact } from "@/features/diagnostic/data";
import { parseTracking } from "@/features/diagnostic/params";
import { createMockMetaAds, type MetaAdsAdapter, type MetaInsightRow } from "@/integrations/meta-ads";
import { parseEnv } from "@/lib/env";
import { createTestDb } from "../helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

const env = parseEnv({ META_COP_PER_USD: "4000", NEXT_PUBLIC_APP_URL: "https://faro.example.com" });
const NOW = new Date("2026-11-03T15:00:00Z");

/** A "real" adapter double (isMock false) returning fixed insights. */
function realDouble(rows: MetaInsightRow[], currency = "COP"): MetaAdsAdapter {
  return {
    isMock: false,
    getAccount: async () => ({ id: "act_1", name: "Mokub Ads", currency, timezone: "America/Bogota", status: 1, pageId: "9", isMock: false }),
    listCampaigns: async () => [],
    getInsights: async () => rows,
    getAdInsights: async () => [],
    createPausedCampaign: async () => {
      throw new Error("unused");
    },
    setCampaignStatus: async () => undefined,
    listAds: async () => [],
    listAdSets: async () => [],
    setAdStatus: async () => undefined,
    setAdSetBudget: async () => undefined,
  };
}

describe("syncMetaAds", () => {
  it("mock mode writes nothing to ad_spend", async () => {
    const out = await syncMetaAds(t.db, createMockMetaAds(), env, { now: NOW });
    expect(out.mode).toBe("mock");
    expect(out.saved).toBe(0);
    expect(out.rows).toBeGreaterThan(0);
    expect(await t.db.select().from(s.adSpend)).toHaveLength(0);
  });

  it("upserts COP spend as USD, idempotently, and attributes it to real leads with that utm_campaign", async () => {
    const campaign = "120000000000001";
    for (const [i, name] of ["Uno SAS", "Dos SAS"].entries()) {
      await recordContact(
        { slug: "icp:clinicas-dentales-bogota", company: `${name} Dental`, email: `info@m${i}.co`, message: "Hola", consent: true },
        parseTracking({ utm_source: "meta", utm_medium: "paid_social", utm_campaign: campaign }),
        "clinicas-dentales-bogota",
        t.db,
      );
    }
    const rows: MetaInsightRow[] = [
      { campaignId: campaign, campaignName: "Mokub web", date: "2026-11-02", spend: 20000, impressions: 1000, clicks: 30, conversations: 1 },
      { campaignId: campaign, campaignName: "Mokub web", date: "2026-11-03", spend: 12000, impressions: 800, clicks: 22, conversations: 0 },
    ];
    const first = await syncMetaAds(t.db, realDouble(rows), env, { now: NOW, days: 7 });
    expect(first).toMatchObject({ mode: "real", saved: 2, currency: "COP", fx: 4000, since: "2026-10-28", until: "2026-11-03" });
    await syncMetaAds(t.db, realDouble(rows), env, { now: NOW });

    const spend = await t.db.select().from(s.adSpend).where(eq(s.adSpend.campaign, campaign));
    expect(spend).toHaveLength(2);
    expect(spend.find((r) => r.date === "2026-11-02")).toMatchObject({ usd: 5, spendLocal: 20000, fx: 4000, currency: "COP", source: "meta_api", conversations: 1, campaignName: "Mokub web", isDemo: false });

    const costs = await t.db.select().from(s.costEntries).where(and(eq(s.costEntries.category, "ads"), eq(s.costEntries.isDemo, false)));
    expect(costs).toHaveLength(2);
    expect(costs.reduce((a, c) => a + c.usd, 0)).toBeCloseTo(8, 6); // (20000 + 12000) / 4000

    const stats = await metaCampaignStats(t.db, "2026-11-01");
    expect(stats.get(campaign)).toEqual({ spendLocal: 32000, usd: 8, impressions: 1800, clicks: 52, conversations: 1 });
    expect((await getLastSync(t.db))?.saved).toBe(2);
  });

  it("refuses unsupported currencies without writing", async () => {
    const out = await syncMetaAds(t.db, realDouble([{ campaignId: "130000000000001", campaignName: "x", date: "2026-11-03", spend: 5, impressions: 1, clicks: 0, conversations: 0 }], "EUR"), env, { now: NOW });
    expect(out.error).toMatch(/EUR/);
    expect(await t.db.select().from(s.adSpend).where(eq(s.adSpend.campaign, "130000000000001"))).toHaveLength(0);
  });
});

describe("guardrails", () => {
  it("only allows https destinations on allowed hosts", () => {
    expect(destinationError("https://www.mokub.co/servicios", env)).toBeNull();
    expect(destinationError("https://faro.example.com/d/icp/x", env)).toBeNull();
    expect(destinationError("http://www.mokub.co/", env)).toMatch(/https/);
    expect(destinationError("https://evil.com/", env)).toMatch(/no permitido/);
    expect(destinationError("https://user:pw@www.mokub.co/", env)).toMatch(/usuario/);
  });

  it("validates campaign input and caps the budget", () => {
    const schema = campaignInputSchema(env);
    const ok = { name: "Mokub", url: "https://www.mokub.co/", dailyBudget: "20000", primaryText: "t", headline: "h" };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ ...ok, dailyBudget: "60000" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, url: "https://evil.com" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, ageMin: 50, ageMax: 30 }).success).toBe(false);
    expect(schema.safeParse({ ...ok, imageUrl: "http://x.co/a.png" }).success).toBe(false);
  });

  it("refuses activation unless spend is enabled, the name matches and the budget is within the cap", () => {
    const c = { id: "1", name: "Mokub web", status: "PAUSED", effectiveStatus: "PAUSED", objective: "OUTCOME_TRAFFIC", dailyBudget: 20000, createdTime: "" };
    expect(activationRefusal(env, c, "Mokub web")).toBe("spend_disabled");
    const on = parseEnv({ ADS_SPEND_ENABLED: "true" });
    expect(activationRefusal(on, c, "mokub web")).toBe("confirm_mismatch");
    expect(activationRefusal(on, { ...c, dailyBudget: 90000 }, "Mokub web")).toBe("over_budget");
    expect(activationRefusal(on, { ...c, dailyBudget: null }, "Mokub web")).toBe("unknown_budget");
    expect(activationRefusal(on, c, "Mokub web")).toBeNull();
  });

  it("computes Bogotá dates", () => {
    expect(bogotaDate(0, new Date("2026-11-03T03:00:00Z"))).toBe("2026-11-02");
    expect(bogotaDate(6, NOW)).toBe("2026-10-28");
  });
});
