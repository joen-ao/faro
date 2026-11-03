import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as s from "@/db/schema";
import { MIGRATIONS_FOLDER } from "@/db/migrate";
import { seedFlaggedFixture } from "../helpers/flagged-fixture";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  conn = await createTestDb();
});
afterAll(() => conn.close());

const count = async (table: PgTable, where?: SQL) => (await conn.db.select({ n: sql<number>`count(*)::int` }).from(table).where(where))[0].n;

/** Re-applies 0013 (already applied once by createTestDb on the empty DB). */
async function runPurge() {
  const file = readFileSync(path.join(MIGRATIONS_FOLDER, "0013_purge_demo.sql"), "utf8");
  for (const stmt of file.split("--> statement-breakpoint")) if (stmt.replace(/--.*$/gm, "").trim()) await conn.db.execute(sql.raw(stmt));
}

describe("0013_purge_demo", () => {
  it("is safe on empty tables and idempotent", async () => {
    await runPurge();
    await runPurge();
    expect(await count(s.leads)).toBe(0);
  });

  it("deletes every is_demo row (and what hangs from it) and keeps real and mock rows", async () => {
    const db = conn.db;
    await seedFlaggedFixture(db); // Demo Workspace + 3 demo companies/leads + demo events/costs/ad_spend
    const [ws] = await db.insert(s.workspaces).values({ name: "Real" }).returning();
    const [icp] = await db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "p" }).returning();
    const [hunt] = await db.insert(s.hunts).values({ icpProfileId: icp.id }).returning();
    const [co] = await db.insert(s.companies).values({ name: "Real SAS", normalizedName: "real" }).returning();
    const [lead] = await db.insert(s.leads).values({ companyId: co.id, huntId: hunt.id, primarySource: "osm", slug: "real-purge" }).returning();
    // demo rows hanging from a REAL lead, plus a mock (not demo) row that must stay
    await db.insert(s.events).values([{ leadId: lead.id, type: "click", isDemo: true }, { leadId: lead.id, type: "click", isMock: true }]);
    await db.insert(s.qualifications).values({ leadId: lead.id, origin: "dapta", qualified: true, isDemo: true });
    await db.insert(s.costEntries).values([{ leadId: lead.id, category: "ai", unit: "u", usd: 1, isDemo: true }, { leadId: lead.id, category: "ai", unit: "u", usd: 2, isMock: true }]);
    await db.insert(s.adVariants).values({ adId: "a1", campaignId: "c", briefId: "b", angle: "x", formatHint: "f", hook: "h", primaryText: "t", headline: "h", cta: "c", hypothesis: "h", isDemo: true });
    const [rec] = await db.insert(s.adRecommendations).values({ rule: "r", action: "alert", entityType: "ad", entityId: "1", title: "t", requiresApproval: false, isDemo: true }).returning();
    await db.insert(s.adActions).values({ recommendationId: rec.id, actor: "human", action: "x", entityType: "ad", entityId: "1", ok: true, isDemo: true });
    await db.insert(s.adLearnings).values({ dimension: "d", metric: "m", winner: "w", statement: "s", confidence: "baja", source: "template", periodStart: "2026-01-01", periodEnd: "2026-01-07", isDemo: true });
    expect(await count(s.leads, sql`is_demo`)).toBeGreaterThan(0);

    await runPurge();

    for (const t of [s.companies, s.leads, s.events, s.qualifications, s.costEntries, s.adSpend, s.adVariants, s.adRecommendations, s.adActions, s.adLearnings])
      expect(await count(t, sql`is_demo`)).toBe(0);
    expect(await count(s.workspaces, sql`name = 'Demo Workspace'`)).toBe(0);
    expect(await count(s.messages)).toBe(0);
    // real rows and mock rows of real leads survive
    expect(await count(s.workspaces, sql`name = 'Real'`)).toBe(1);
    expect(await count(s.leads)).toBe(1);
    expect(await count(s.events)).toBe(1);
    expect(await count(s.costEntries)).toBe(1);
    expect(await count(s.costRates)).toBeGreaterThan(0);
  });
});
