import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { getCostTotals } from "@/db/queries";
import { seed } from "@/db/seed";
import { getChannelMetrics, getPublicMetrics } from "@/features/metrics";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;

async function mkLead(i: number, source: "osm" | "meta_ads", huntId: string, fit: number | null, demo = false) {
  const [c] = await conn.db.insert(s.companies).values({ name: `Co ${i} SAS`, normalizedName: `co ${i}`, isDemo: demo }).returning();
  const [l] = await conn.db
    .insert(s.leads)
    .values({ companyId: c.id, huntId, primarySource: source, slug: `m-${i}`, fitScore: fit, isDemo: demo })
    .returning();
  return l.id;
}

beforeAll(async () => {
  conn = await createTestDb();
  const { db } = conn;
  await seed(db); // demo workspace/leads/costs, all flagged is_demo / is_mock
  const [ws] = await db.insert(s.workspaces).values({ name: "Real" }).returning();
  const [icp] = await db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "p", threshold: 60 }).returning();
  const [hunt] = await db.insert(s.hunts).values({ icpProfileId: icp.id }).returning();

  // osm: 4 leads, 3 fit (60, 80, 90; one at 59), 2 emailed, 1 replied, 0 qualified
  const osm = [await mkLead(1, "osm", hunt.id, 60), await mkLead(2, "osm", hunt.id, 80), await mkLead(3, "osm", hunt.id, 90), await mkLead(4, "osm", hunt.id, 59)];
  // meta_ads: 2 leads both fit, one via widget, qualified
  const ads = [await mkLead(5, "meta_ads", hunt.id, 70), await mkLead(6, "meta_ads", hunt.id, 75)];

  await db.insert(s.messages).values([
    { leadId: osm[0], contactChannel: "email", body: "b", status: "sent", sentAt: new Date() },
    { leadId: osm[1], contactChannel: "email", body: "b", status: "sent", sentAt: new Date() },
    { leadId: osm[2], contactChannel: "email", body: "b", status: "blocked" },
  ]);
  await db.insert(s.events).values([
    { leadId: osm[0], type: "reply" },
    { leadId: ads[0], type: "widget_chat" },
    { leadId: ads[1], type: "widget_open" },
    // diagnostic opens: a page_view counts, a plain click does not, mock/demo opens never count for real leads
    { leadId: osm[0], type: "click", payload: { kind: "page_view" }, utm: { c: "email", s: "osm" } },
    { leadId: osm[0], type: "click", payload: { kind: "page_view" }, utm: { c: "email", s: "osm" } },
    { leadId: osm[1], type: "click", payload: { kind: "whatsapp" } },
    { leadId: osm[2], type: "click", payload: { kind: "page_view" }, isMock: true },
    { leadId: osm[3], type: "widget_chat", isDemo: true },
  ]);
  await db.insert(s.qualifications).values([
    { leadId: ads[0], origin: "dapta", qualified: true },
    { leadId: ads[1], origin: "fallback", qualified: true, isMock: true }, // mock: must not count as real
    { leadId: osm[1], origin: "dapta", qualified: false }, // talked to the agent, not qualified
  ]);
  await db.insert(s.costEntries).values([
    { leadId: osm[0], sourceChannel: "osm", category: "ai", quantity: 1, unit: "x", rate: 1, usd: 1 },
    { leadId: osm[1], sourceChannel: "osm", category: "email", quantity: 1, unit: "x", rate: 2, usd: 2 },
    { sourceChannel: "osm", huntId: hunt.id, category: "scraping", quantity: 1, unit: "run", rate: 3, usd: 3 }, // unprorated shared
    { leadId: ads[0], sourceChannel: "meta_ads", category: "ads", quantity: 1, unit: "x", rate: 6, usd: 6 },
    { leadId: ads[1], sourceChannel: "meta_ads", category: "dapta", quantity: 1, unit: "x", rate: 2, usd: 2 },
    { category: "human", quantity: 1, unit: "x", rate: 0.5, usd: 0.5 }, // no lead, no source
    { leadId: osm[3], sourceChannel: "osm", category: "dapta", quantity: 1, unit: "x", rate: 0.7, usd: 0.7, isMock: true }, // mock cost on a real lead
    { leadId: ads[0], sourceChannel: "meta_ads", category: "data", quantity: 1, unit: "x", rate: 0.2, usd: 0.2, isDemo: true }, // demo cost on a real lead
  ]);
});
afterAll(() => conn.close());

describe("getChannelMetrics", () => {
  it("counts diagnostic opens and agent conversations per source and channel (real only, one per lead)", async () => {
    const m = await getChannelMetrics(conn.db);
    const osm = m.real.bySource.find((r) => r.source === "osm")!;
    expect(osm).toMatchObject({ contacted: 2, opened: 1, responded: 1, chatted: 1 });
    const ads = m.real.bySource.find((r) => r.source === "meta_ads")!;
    expect(ads).toMatchObject({ opened: 1, chatted: 1 });
    const email = m.real.byContact.find((r) => r.contact === "email")!;
    expect(email).toMatchObject({ opened: 1, chatted: 1 });
    expect(m.real.totals).toMatchObject({ opened: 2, chatted: 2 });
  });

  it("excludes demo/mock by default and ties to getCostTotals", async () => {
    const m = await getChannelMetrics(conn.db);
    expect(m.demo).toBeNull();
    const totals = await getCostTotals(conn.db);
    expect(m.real.totals.costUsd).toBeCloseTo(totals.totalUsd, 6);
    expect(m.real.totals.costUsd).toBeCloseTo(14.5, 6);
    expect(m.real.unattributedUsd).toBe(0.5);
    expect(m.real.excludedMockUsd).toBe(0.7);
    expect(m.real.excludedDemoUsd).toBe(0.2);
    expect(m.real.bySource.map((r) => r.source).sort()).toEqual(["meta_ads", "osm"]);
    expect(m.real.bySource.some((r) => r.source === "sample")).toBe(false);
  });

  it("computes the funnel, CPL and CPLC per source", async () => {
    const m = await getChannelMetrics(conn.db);
    const osm = m.real.bySource.find((r) => r.source === "osm")!;
    expect(osm).toMatchObject({ found: 4, fit: 3, contacted: 2, responded: 1, qualified: 0, costUsd: 6 });
    expect(osm.cpl).toBe(2);
    expect(osm.cplc).toBeNull();
    expect(osm.insufficientData).toBe(true);
    expect(osm.qualifiedRate.n).toBe(3);

    const ads = m.real.bySource.find((r) => r.source === "meta_ads")!;
    // the mock qualification of ads[1] does not count
    expect(ads).toMatchObject({ found: 2, fit: 2, contacted: 0, qualified: 1, costUsd: 8 });
    expect(ads.cpl).toBe(4);
    expect(ads.cplc).toBe(8);
    expect(ads.insufficientData).toBe(false);
  });

  it("groups by contact channel and builds source x channel cells", async () => {
    const m = await getChannelMetrics(conn.db);
    const email = m.real.byContact.find((r) => r.contact === "email")!;
    expect(email).toMatchObject({ contacted: 2, fit: 2, responded: 1, costUsd: 3 });
    const widget = m.real.byContact.find((r) => r.contact === "dapta_widget")!;
    expect(widget).toMatchObject({ found: 2, contacted: 0, qualified: 1, costUsd: 8 }); // widget-only leads are not "contacted"
    const cell = m.real.cells.find((r) => r.source === "meta_ads" && r.contact === "dapta_widget")!;
    expect(cell.cplc).toBe(8);
    expect(m.real.cells.find((r) => r.source === "osm" && r.contact === "email")!.found).toBe(2);
  });

  it("includeDemo returns demo separately and never mixes it into real", async () => {
    const base = await getChannelMetrics(conn.db);
    const both = await getChannelMetrics(conn.db, { includeDemo: true });
    expect(both.real).toEqual(base.real);
    expect(both.demo).not.toBeNull();
    expect(both.demo!.totals.found).toBe(3);
    expect(both.demo!.bySource.map((r) => r.source).sort()).toEqual(["meta_ads", "osm", "sample"]); // cost-only rows for excluded mock/demo cost
    expect(both.demo!.totals.costUsd).toBeCloseTo(0.0384 + 0.9, 6); // seed demo + mock/demo entries kept out of real
    expect(both.demo!.excludedMockUsd).toBe(0);
    expect(both.demo!.totals.qualified).toBe(1); // mock qualification counts only inside the demo bucket
  });

  it("returns empty, safe numbers with no data", async () => {
    const empty = await createTestDb();
    const m = await getChannelMetrics(empty.db);
    expect(m.real.totals).toMatchObject({ found: 0, fit: 0, costUsd: 0, cpl: null, cplc: null, insufficientData: true });
    expect(m.real.bySource).toEqual([]);
    await empty.close();
  });
});

describe("getPublicMetrics", () => {
  it("returns real aggregates only and no company fields", async () => {
    const p = await getPublicMetrics(conn.db);
    expect(p.hasData).toBe(true);
    expect(p.leadsFit).toBe(5);
    expect(p.totalCostUsd).toBeCloseTo(14.5, 6);
    expect(p.paidVsFree.paid).toMatchObject({ fit: 2, costUsd: 8, cpl: 4 });
    expect(p.paidVsFree.free).toMatchObject({ fit: 3, costUsd: 6, cpl: 2 });
    expect(JSON.stringify(p)).not.toMatch(/Co \d|slug|sample/);
  });
});
