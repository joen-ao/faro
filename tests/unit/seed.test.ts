import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { DEFAULT_COST_RATES, seedCostRates } from "@/db/seed";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  conn = await createTestDb();
  await seedCostRates(conn.db);
});
afterAll(() => conn.close());

describe("seed", () => {
  it("seeds default cost_rates per SPEC §7 and no business rows", async () => {
    const rows = await conn.db.select().from(s.costRates);
    const by = Object.fromEntries(rows.map((r) => [r.key, r.usd]));
    expect(rows).toHaveLength(DEFAULT_COST_RATES.length);
    expect(by.dapta_credit).toBe(0.001);
    expect(by.dapta_credits_per_ai_reply).toBe(40);
    expect(by.human_minute).toBe(0.42);
    for (const k of ["anthropic_input_per_1m", "anthropic_output_per_1m", "places_per_call", "apify_per_result", "email_per_message"])
      expect(by[k]).toBeGreaterThan(0);
    const [w] = await conn.db.select({ n: sql<number>`count(*)::int` }).from(s.workspaces);
    expect(w.n).toBe(0);
  });

  it("is idempotent", async () => {
    await seedCostRates(conn.db);
    const [r] = await conn.db.select({ n: sql<number>`count(*)::int` }).from(s.costRates);
    expect(r.n).toBe(DEFAULT_COST_RATES.length);
  });
});
