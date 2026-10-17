import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as s from "@/db/schema";
import { DEFAULT_COST_RATES, seed } from "@/db/seed";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  conn = await createTestDb();
  await seed(conn.db);
});
afterAll(() => conn.close());

const count = async (table: PgTable, where?: SQL) => {
  const r = await conn.db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return r[0].n;
};

describe("seed", () => {
  it("creates demo data and every demo row is flagged is_demo", async () => {
    expect(await count(s.workspaces)).toBe(1);
    expect(await count(s.icpProfiles)).toBe(1);
    expect(await count(s.companies)).toBeGreaterThan(0);
    expect(await count(s.companies, eq(s.companies.isDemo, false))).toBe(0);
    expect(await count(s.leads, eq(s.leads.isDemo, false))).toBe(0);
    expect(await count(s.costEntries, eq(s.costEntries.isDemo, false))).toBe(0);
    expect(await count(s.events, eq(s.events.isDemo, false))).toBe(0);
    expect(await count(s.qualifications, eq(s.qualifications.isDemo, false))).toBe(0);
    expect(await count(s.adSpend, eq(s.adSpend.isDemo, false))).toBe(0);
    expect(await count(s.companySources, eq(s.companySources.isMock, false))).toBe(0);
  });

  it("seeds default cost_rates per SPEC §7 (not demo)", async () => {
    const rows = await conn.db.select().from(s.costRates);
    const by = Object.fromEntries(rows.map((r) => [r.key, r.usd]));
    expect(rows).toHaveLength(DEFAULT_COST_RATES.length);
    expect(by.dapta_credit).toBe(0.001);
    expect(by.dapta_credits_per_ai_reply).toBe(40);
    expect(by.human_minute).toBe(0.42);
    for (const k of ["anthropic_input_per_1m", "anthropic_output_per_1m", "places_per_call", "apify_per_result", "email_per_message"])
      expect(by[k]).toBeGreaterThan(0);
  });

  it("is idempotent", async () => {
    const r = await seed(conn.db);
    expect(r.skippedDemo).toBe(true);
    expect(await count(s.workspaces)).toBe(1);
    expect(await count(s.costRates)).toBe(DEFAULT_COST_RATES.length);
  });
});
