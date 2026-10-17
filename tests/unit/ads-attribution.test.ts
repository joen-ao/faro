import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { saveAdSpend, parseSpendCsv } from "@/features/ads";
import { recordContact } from "@/features/diagnostic/data";
import { parseTracking } from "@/features/diagnostic/params";
import { getChannelMetrics } from "@/features/metrics";
import { createTestDb } from "../helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

const ICP = "clinicas-dentales-bogota";
const form = (company: string, email: string) => ({ slug: `icp:${ICP}`, company, email, message: "Hola, queremos info.", consent: true as const });
const metaQuery = (campaign: string) => parseTracking({ utm_source: "meta", utm_medium: "paid_social", utm_campaign: campaign });

describe("fbclid / utm_source=meta tracking", () => {
  it("normalizes fbclid to utm_source=meta without storing the click id", () => {
    expect(parseTracking({ fbclid: "IwAR-abc", utm_campaign: "c1" }).utm).toEqual({ utm_campaign: "c1", utm_source: "meta" });
    expect(parseTracking({ fbclid: "x", utm_source: "newsletter" }).utm).toEqual({ utm_source: "newsletter" });
    expect(parseTracking({ fbclid: "  " }).utm).toBeUndefined();
  });
});

describe("Meta attribution -> meta_ads", () => {
  it("creates the lead as meta_ads with dapta_widget contact channel and utm_source=meta on its event", async () => {
    await recordContact(form("Clínica Uno SAS", "info@uno.co"), parseTracking({ fbclid: "abc", utm_campaign: "attr-1" }), ICP, t.db);
    const [lead] = await t.db.select().from(s.leads);
    expect(lead.primarySource).toBe("meta_ads");
    const [ev] = await t.db.select().from(s.events).where(eq(s.events.leadId, lead.id));
    expect(ev.type).toBe("form_submit");
    expect(ev.utm).toMatchObject({ utm_source: "meta", utm_campaign: "attr-1" });

    await t.db.update(s.leads).set({ fitScore: 80 }).where(eq(s.leads.id, lead.id));
    const m = await getChannelMetrics(t.db);
    expect(m.real.cells.find((c) => c.source === "meta_ads" && c.contact === "dapta_widget")?.found).toBe(1);
  });
});

describe("ad spend -> CPL of meta_ads (real only)", () => {
  it("splits real spend only across real leads and reflects it in CPL; demo spend stays out of real", async () => {
    const campaign = "spend-1";
    for (const [i, name] of ["Alfa SAS", "Beta SAS", "Gamma SAS"].entries()) {
      await recordContact(form(`${name} Dental`, `info@x${i}.co`), metaQuery(campaign), ICP, t.db);
    }
    // a demo lead that clicked the same campaign must receive none of the real spend
    const [co] = await t.db.insert(s.companies).values({ name: "Demo Dental", normalizedName: "demo dental", isDemo: true }).returning();
    const [demo] = await t.db.insert(s.leads).values({ companyId: co.id, primarySource: "meta_ads", slug: "demo-ads", isDemo: true }).returning();
    await t.db.insert(s.events).values({ leadId: demo.id, type: "form_submit", utm: { utm_source: "meta", utm_campaign: campaign }, isDemo: true });

    const real = await t.db.select().from(s.leads).where(eq(s.leads.isDemo, false));
    for (const l of real) await t.db.update(s.leads).set({ fitScore: 80 }).where(eq(s.leads.id, l.id));
    const before = (await getChannelMetrics(t.db)).real.bySource.find((r) => r.source === "meta_ads")!;
    expect(before.found).toBe(4); // attr-1 lead + 3 new
    expect(before.cpl).toBe(0);

    const { rows } = parseSpendCsv("campaign,date,usd,impressions,clicks\nspend-1,2026-10-01,12,1000,30\nspend-1,2026-10-02,18,900,25");
    const res = await saveAdSpend(t.db, rows);
    expect(res).toEqual({ saved: 2, campaigns: ["spend-1"] });

    const ads = await t.db.select().from(s.costEntries).where(and(eq(s.costEntries.category, "ads"), eq(s.costEntries.isDemo, false)));
    expect(ads).toHaveLength(3);
    expect(ads.every((a) => a.usd === 10 && a.sourceChannel === "meta_ads")).toBe(true);
    expect(ads.some((a) => a.leadId === demo.id)).toBe(false);

    const after = (await getChannelMetrics(t.db)).real.bySource.find((r) => r.source === "meta_ads")!;
    expect(after.costUsd).toBe(30);
    expect(after.cpl).toBeCloseTo(30 / 4, 6); // fit = 4 real meta leads
  });

  it("is idempotent on re-upload (upsert by platform/campaign/date) and keeps is_demo spend out of real", async () => {
    await saveAdSpend(t.db, [{ platform: "meta", campaign: "spend-1", date: "2026-10-01", usd: 12, impressions: 1000, clicks: 30 }]);
    expect(await t.db.select().from(s.adSpend).where(eq(s.adSpend.campaign, "spend-1"))).toHaveLength(2);
    const real = (await getChannelMetrics(t.db)).real.bySource.find((r) => r.source === "meta_ads")!;
    expect(real.costUsd).toBe(30);

    await saveAdSpend(t.db, [{ platform: "meta", campaign: "spend-1", date: "2026-10-09", usd: 99, impressions: 0, clicks: 0 }], { isDemo: true });
    const m = await getChannelMetrics(t.db, { includeDemo: true });
    expect(m.real.bySource.find((r) => r.source === "meta_ads")!.costUsd).toBe(30);
    expect(m.demo?.bySource.find((r) => r.source === "meta_ads")?.costUsd).toBe(99);
  });
});
