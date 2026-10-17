import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { seedCostRates } from "@/db/seed";
import {
  attributeAdSpend,
  getLeadReceipt,
  prorateSharedCost,
  recordCost,
  recordDaptaCost,
  recordHumanCost,
  recordPlacesCost,
  splitEvenly,
} from "@/features/metrics";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
let leadIds: string[];
let huntId: string;

beforeAll(async () => {
  conn = await createTestDb();
  const { db } = conn;
  await seedCostRates(db);
  const [ws] = await db.insert(s.workspaces).values({ name: "T" }).returning();
  const [icp] = await db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "p" }).returning();
  const [hunt] = await db.insert(s.hunts).values({ icpProfileId: icp.id }).returning();
  huntId = hunt.id;
  const cs = await db
    .insert(s.companies)
    .values([1, 2, 3].map((i) => ({ name: `Empresa ${i} SAS`, normalizedName: `empresa ${i}` })))
    .returning();
  const ls = await db
    .insert(s.leads)
    .values(cs.map((c, i) => ({ companyId: c.id, huntId, primarySource: "osm" as const, slug: `t-${i}`, fitScore: 80 })))
    .returning();
  leadIds = ls.map((l) => l.id);
});
afterAll(() => conn.close());

describe("splitEvenly / prorateSharedCost", () => {
  it("1 USD among 3 sums to exactly 1.000000, remainder on the last", () => {
    const shares = splitEvenly(1, 3);
    expect(shares).toEqual([0.333333, 0.333333, 0.333334]);
    expect(Math.round(shares.reduce((a, b) => a + b, 0) * 1e6)).toBe(1_000_000);
  });

  it("is exact for awkward totals and sizes", () => {
    for (const [total, n] of [[0.1, 7], [12.345679, 13], [0.000001, 3], [400, 400], [0, 5]] as const) {
      const sum = splitEvenly(total, n).reduce((a, b) => a + Math.round(b * 1e6), 0);
      expect(sum).toBe(Math.round(total * 1e6));
    }
  });

  it("rejects empty lead lists and negative totals", () => {
    expect(() => splitEvenly(1, 0)).toThrow(RangeError);
    expect(() => splitEvenly(-1, 2)).toThrow(RangeError);
  });

  it("persists one entry per lead and the DB sum equals the total", async () => {
    const entries = await prorateSharedCost(conn.db, {
      huntId,
      sourceChannel: "osm",
      category: "scraping",
      totalUsd: 1,
      leadIds,
      evidence: "Apify run abc123",
    });
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.usd)).toEqual([0.333333, 0.333333, 0.333334]);
    expect(entries.every((e) => e.evidence?.includes("Apify run abc123"))).toBe(true);
  });
});

describe("recordCost", () => {
  it("validates input with Zod", async () => {
    await expect(recordCost(conn.db, { category: "ai", quantity: 1, unit: "x", evidence: "" })).rejects.toThrow();
    await expect(recordCost(conn.db, { category: "nope" as never, quantity: 1, unit: "x", evidence: "e" })).rejects.toThrow();
    await expect(recordCost(conn.db, { category: "ai", quantity: -1, unit: "x", evidence: "e" })).rejects.toThrow();
  });

  it("defaults usd to quantity x rate, rounded to 6 decimals", async () => {
    const e = await recordCost(conn.db, { leadId: leadIds[0], category: "ai", quantity: 1234, unit: "tokens", rate: 0.000003, evidence: "msg_1", isDemo: false });
    expect(e.usd).toBe(0.003702);
  });
});

describe("builders and receipt", () => {
  it("Dapta = replies x credits x USD/credit; human = minutes x rate; Places free tier keeps list value", async () => {
    const d = await recordDaptaCost(conn.db, { leadId: leadIds[1], aiReplies: 3, conversationId: "c-1" });
    expect(d.quantity).toBe(120);
    expect(d.usd).toBeCloseTo(0.12, 6);
    const h = await recordHumanCost(conn.db, { leadId: leadIds[1], minutes: 5 });
    expect(h.usd).toBeCloseTo(2.1, 6);
    const p = await recordPlacesCost(conn.db, { leadId: leadIds[1], calls: 2, freeTier: true });
    expect(p.usd).toBe(0);
    expect(p.rate).toBe(0.032);
    const paid = await recordPlacesCost(conn.db, { leadId: leadIds[2], calls: 2, freeTier: false });
    expect(paid.usd).toBeCloseTo(0.064, 6);
  });

  it("receipt lines per category and the total equals the sum of cost_entries", async () => {
    const receipt = await getLeadReceipt(conn.db, leadIds[1]);
    expect(receipt).not.toBeNull();
    const rows = await conn.db.select().from(s.costEntries).where(eq(s.costEntries.leadId, leadIds[1]));
    const sum = rows.reduce((a, r) => a + Math.round(r.usd * 1e6), 0) / 1e6;
    expect(receipt!.totalUsd).toBe(sum);
    expect(receipt!.entryCount).toBe(rows.length);
    expect(receipt!.categories.map((c) => c.category)).toEqual(["data", "scraping", "ai", "email", "whatsapp", "dapta", "ads", "human"]);
    const data = receipt!.categories.find((c) => c.category === "data")!;
    expect(data.lines[0]).toMatchObject({ usd: 0, listUsd: 0.064, coveredByFreeTier: true });
    expect(receipt!.listTotalUsd).toBeGreaterThan(receipt!.totalUsd);
    expect(receipt!.isDemo).toBe(false);
    expect(receipt!.categories.find((c) => c.category === "scraping")!.subtotalUsd).toBe(0.333333);
  });

  it("returns null for unknown leads and marks demo receipts", async () => {
    expect(await getLeadReceipt(conn.db, "00000000-0000-4000-8000-000000000000")).toBeNull();
    await recordCost(conn.db, { leadId: leadIds[2], category: "email", quantity: 1, unit: "email", rate: 0.0004, evidence: "x", isMock: true });
    expect((await getLeadReceipt(conn.db, leadIds[2]))!.isDemo).toBe(true);
  });
});

describe("attributeAdSpend", () => {
  it("returns [] without spend or attribution", async () => {
    expect(await attributeAdSpend(conn.db, { campaign: "nada" })).toEqual([]);
  });

  it("divides campaign spend among UTM-attributed leads, once", async () => {
    await conn.db.insert(s.adSpend).values([
      { platform: "meta", campaign: "c1", date: "2026-10-16", usd: 4 },
      { platform: "meta", campaign: "c1", date: "2026-10-17", usd: 3 },
    ]);
    await conn.db.insert(s.events).values([
      { leadId: leadIds[0], type: "click", utm: { utm_campaign: "c1" } },
      { leadId: leadIds[0], type: "widget_open", utm: { utm_campaign: "c1" } },
      { leadId: leadIds[2], type: "click", utm: { utm_campaign: "c1" } },
      { leadId: leadIds[1], type: "click", utm: { utm_campaign: "other" } },
    ]);
    const entries = await attributeAdSpend(conn.db, { campaign: "c1" });
    expect(entries).toHaveLength(2);
    expect(entries.reduce((a, e) => a + Math.round(e.usd * 1e6), 0)).toBe(7_000_000);
    expect(entries.every((e) => e.sourceChannel === "meta_ads" && e.category === "ads")).toBe(true);
    expect(entries.every((e) => !e.isDemo)).toBe(true);
    // idempotent: re-attributing replaces
    expect(await attributeAdSpend(conn.db, { campaign: "c1" })).toHaveLength(2);
    const all = await conn.db.select().from(s.costEntries).where(eq(s.costEntries.category, "ads"));
    expect(all.filter((e) => e.evidence?.startsWith("campaña c1:"))).toHaveLength(2);
  });

  it("keeps demo and real spend apart, each only to leads of its own kind", async () => {
    const [c] = await conn.db.insert(s.companies).values({ name: "Demo Co", normalizedName: "demo co", isDemo: true }).returning();
    const [dl] = await conn.db.insert(s.leads).values({ companyId: c.id, huntId, primarySource: "osm", slug: "t-demo", isDemo: true }).returning();
    await conn.db.insert(s.adSpend).values([
      { platform: "meta", campaign: "mix", date: "2026-10-17", usd: 10 },
      { platform: "meta", campaign: "mix", date: "2026-10-18", usd: 2, isDemo: true },
    ]);
    await conn.db.insert(s.events).values([
      { leadId: leadIds[0], type: "click", utm: { utm_campaign: "mix" } },
      { leadId: leadIds[1], type: "click", utm: { utm_campaign: "mix" }, isMock: true }, // mock event: no real spend
      { leadId: dl.id, type: "click", utm: { utm_campaign: "mix" } },
    ]);
    const entries = await attributeAdSpend(conn.db, { campaign: "mix" });
    expect(entries.filter((e) => !e.isDemo).map((e) => [e.leadId, e.usd])).toEqual([[leadIds[0], 10]]);
    expect(entries.filter((e) => e.isDemo).map((e) => [e.leadId, e.usd])).toEqual([[dl.id, 2]]);
  });
});
