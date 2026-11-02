import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { syncMetaAds } from "@/features/ads";
import { adPerformance, CreateBody, createCopilotCampaign, wilson } from "@/features/copilot";
import { recordContact } from "@/features/diagnostic/data";
import { parseTracking } from "@/features/diagnostic/params";
import { createMockMetaAds, type MetaAdsAdapter } from "@/integrations/meta-ads";
import { parseEnv } from "@/lib/env";
import { defaultCatalog } from "@/features/settings/services";
import { createTestDb } from "../helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

const env = parseEnv({ META_COP_PER_USD: "4000", NEXT_PUBLIC_APP_URL: "https://faro.example.com" });
const prices = defaultCatalog().services.flatMap((x) => [x.price, x.entryOffer]);
const variant = (angle: string, extra: Record<string, unknown> = {}) => ({ angle, format_hint: "estatico", hook: "Hook de prueba", primaryText: "Atendemos tus consultas por WhatsApp sin perder clientes. Proyectos desde USD 3.000.", headline: "Agentes de IA", cta: "LEARN_MORE", hypothesis: "Probar el dolor operativo", ...extra });
const body = (variants: unknown[]) =>
  CreateBody.parse({ name: "Mokub prueba", brief: { serviceId: "agentes-ia", url: "https://www.mokub.co/", dailyBudget: 40000, audience: "Pymes en Bogotá" }, variants });

describe("wilson", () => {
  it("gives a sensible 95% interval and null for n=0", () => {
    const w = wilson(3, 10)!;
    expect(w.low).toBeCloseTo(0.108, 2);
    expect(w.high).toBeCloseTo(0.603, 2);
    expect(wilson(0, 0)).toBeNull();
  });
});

describe("createCopilotCampaign", () => {
  it("blocks variants that fail the policy linter, without calling Meta", async () => {
    let called = false;
    const ads = { ...createMockMetaAds(), createPausedCampaign: async () => { called = true; throw new Error("should not be called"); } } as MetaAdsAdapter;
    const out = await createCopilotCampaign(t.db, ads, env, body([variant("Ángulo A"), variant("Ángulo B", { primaryText: "Resultados garantizados para tu pyme en una semana." })]), prices);
    expect(out).toMatchObject({ ok: false, error: "lint", lint: [{ index: 1 }] });
    expect(called).toBe(false);
  });

  it("rejects destinations outside the allow-list and budgets over the cap", async () => {
    const b = body([variant("Ángulo A")]);
    expect(await createCopilotCampaign(t.db, createMockMetaAds(), env, { ...b, brief: { ...b.brief, url: "https://evil.com/" } }, prices)).toMatchObject({ ok: false, error: "invalid" });
    expect(await createCopilotCampaign(t.db, createMockMetaAds(), env, { ...b, brief: { ...b.brief, dailyBudget: 90000 } }, prices)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("creates N paused ads and stores each concept (mock rows are DEMO)", async () => {
    const out = await createCopilotCampaign(t.db, createMockMetaAds(), env, body([variant("Dolor"), variant("Demo"), variant("Precio")]), prices);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.created.ads).toHaveLength(3);
    expect(out.created.urlTags).toContain("{{ad.id}}");
    const rows = await t.db.select().from(s.adVariants);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.isDemo && r.campaignId === out.created.campaignId)).toBe(true);
  });
});

describe("adPerformance", () => {
  it("joins ad insights with leads by utm_content and real qualifications into CPQL", async () => {
    const adA = "120000000000101";
    const adB = "120000000000102";
    const campaign = "120000000000100";
    // A real variant row for ad A (as if created in real mode).
    await t.db.insert(s.adVariants).values({ adId: adA, campaignId: campaign, briefId: "b1", angle: "Dolor operativo", formatHint: "video_fundador", hook: "h", primaryText: "t", headline: "h", cta: "LEARN_MORE", hypothesis: "x" });
    // Sync ad insights through a "real" adapter double.
    const real: MetaAdsAdapter = {
      ...createMockMetaAds(),
      isMock: false,
      getAccount: async () => ({ id: "act_1", name: "Mokub Ads", currency: "COP", timezone: "America/Bogota", status: 1, pageId: "9", isMock: false }),
      getInsights: async () => [],
      getAdInsights: async () => [
        { adId: adA, adName: "A", campaignId: campaign, date: "2026-11-02", spend: 30000, impressions: 4000, clicks: 70, linkClicks: 60, frequency: 1.3, conversations: 0 },
        { adId: adA, adName: "A", campaignId: campaign, date: "2026-11-03", spend: 10000, impressions: 1000, clicks: 12, linkClicks: 10, frequency: 1.4, conversations: 0 },
        { adId: adB, adName: "B", campaignId: campaign, date: "2026-11-03", spend: 5000, impressions: 800, clicks: 5, linkClicks: 4, frequency: 1.1, conversations: 0 },
      ],
    };
    await syncMetaAds(t.db, real, env, { now: new Date("2026-11-03T15:00:00Z") });
    await syncMetaAds(t.db, real, env, { now: new Date("2026-11-03T15:00:00Z") }); // idempotent

    // Two real leads from ad A (one qualified by Dapta), one demo lead from ad A that must not count.
    const tracking = parseTracking({ utm_source: "meta", utm_medium: "paid_social", utm_campaign: campaign, utm_content: adA });
    for (const [i, name] of ["Uno SAS", "Dos SAS"].entries()) {
      await recordContact({ slug: "icp:clinicas-dentales-bogota", company: `${name} Dental`, email: `info@p${i}.co`, message: "Hola", consent: true }, tracking, "clinicas-dentales-bogota", t.db);
    }
    const leads = await t.db.select().from(s.leads);
    await t.db.insert(s.qualifications).values({ leadId: leads[0]!.id, origin: "dapta", qualified: true });
    const [co] = await t.db.insert(s.companies).values({ name: "Demo", normalizedName: "demo", isDemo: true }).returning();
    const [demo] = await t.db.insert(s.leads).values({ companyId: co!.id, primarySource: "meta_ads", slug: "demo-cp", isDemo: true }).returning();
    await t.db.insert(s.events).values({ leadId: demo!.id, type: "form_submit", utm: { utm_source: "meta", utm_content: adA }, isDemo: true });
    await t.db.insert(s.qualifications).values({ leadId: demo!.id, origin: "dapta", qualified: true, isDemo: true });

    const perf = await adPerformance(t.db, "2026-10-01");
    const a = perf.find((p) => p.adId === adA)!;
    expect(a).toMatchObject({ angle: "Dolor operativo", spendLocal: 40000, impressions: 5000, linkClicks: 70, leads: 2, qualified: 1, cpl: 20000, cpql: 40000, ctrReady: true, qualityReady: false });
    expect(a.ctr).toBeCloseTo(0.014, 6);
    const b = perf.find((p) => p.adId === adB)!;
    expect(b).toMatchObject({ angle: null, leads: 0, cpql: null, ctrReady: false });
  });
});
