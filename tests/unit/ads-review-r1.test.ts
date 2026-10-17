import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { parseSpendCsv, saveAdSpend, unattributedSpend } from "@/features/ads";
import { recordContact } from "@/features/diagnostic/data";
import { parseTracking } from "@/features/diagnostic/params";
import { createTestDb } from "../helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

describe("ad_spend key includes is_demo", () => {
  it("a demo upload with the same platform/campaign/date never overwrites the real row, nor the reverse", async () => {
    const key = { platform: "meta", campaign: "keyed", date: "2026-10-05", impressions: 0, clicks: 0 };
    await saveAdSpend(t.db, [{ ...key, usd: 12.5 }]);
    await saveAdSpend(t.db, [{ ...key, usd: 999 }], { isDemo: true });
    let rows = await t.db.select().from(s.adSpend).where(eq(s.adSpend.campaign, "keyed"));
    expect(rows.map((r) => [r.isDemo, r.usd]).sort()).toEqual([[false, 12.5], [true, 999]]);
    await saveAdSpend(t.db, [{ ...key, usd: 20 }]);
    rows = await t.db.select().from(s.adSpend).where(eq(s.adSpend.campaign, "keyed"));
    expect(rows.find((r) => !r.isDemo)?.usd).toBe(20);
    expect(rows.find((r) => r.isDemo)?.usd).toBe(999);
  });
});

describe("attribution scope and unattributed spend", () => {
  it("only platform=meta spend reaches meta_ads; spend without leads is reported", async () => {
    await recordContact(
      { slug: "icp:clinicas-dentales-bogota", company: "Clínica Sur SAS", email: "info@sur.co", message: "Hola, info.", consent: true },
      parseTracking({ utm_source: "meta", utm_campaign: "scope-1" }),
      "clinicas-dentales-bogota",
      t.db,
    );
    await saveAdSpend(t.db, [
      { platform: "meta", campaign: "scope-1", date: "2026-10-01", usd: 10, impressions: 0, clicks: 0 },
      { platform: "tiktok", campaign: "scope-1", date: "2026-10-01", usd: 500, impressions: 0, clicks: 0 },
      { platform: "meta", campaign: "typo-camp", date: "2026-10-01", usd: 7, impressions: 0, clicks: 0 },
    ]);
    const ads = await t.db.select().from(s.costEntries).where(and(eq(s.costEntries.category, "ads"), eq(s.costEntries.isDemo, false)));
    expect(ads.reduce((a, c) => a + c.usd, 0)).toBe(10);
    const orphan = await unattributedSpend(t.db);
    expect(orphan).toContainEqual({ campaign: "typo-camp", usd: 7 });
    expect(orphan.map((o) => o.campaign)).not.toContain("scope-1");
  });
});

describe("campaign validation", () => {
  it("rejects a leading - and collapses whitespace", () => {
    const r = parseSpendCsv(["campaign,date,usd", "-cmd,2026-10-01,1", "  a   b ,2026-10-01,1"].join("\n"));
    expect(r.errors.map((e) => e.line)).toEqual([2]);
    expect(r.rows[0].campaign).toBe("a b");
  });
});
