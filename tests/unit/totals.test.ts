import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { getCostTotals } from "@/db/queries";
import { seed } from "@/db/seed";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  conn = await createTestDb();
  await seed(conn.db);
});
afterAll(() => conn.close());

describe("getCostTotals", () => {
  it("is zero when only demo data exists", async () => {
    expect(await getCostTotals(conn.db)).toEqual({ totalUsd: 0, byCategory: {} });
  });

  it("excludes demo and mock by default, includes real rows", async () => {
    await conn.db.insert(s.costEntries).values([
      { category: "ai", unit: "tokens", usd: 2 },
      { category: "ai", unit: "tokens", usd: 1.5, isMock: true },
    ]);
    const real = await getCostTotals(conn.db);
    expect(real.totalUsd).toBeCloseTo(2);
    expect(real.byCategory).toEqual({ ai: 2 });
  });

  it("includeDemo sums everything", async () => {
    const all = await getCostTotals(conn.db, { includeDemo: true });
    expect(all.totalUsd).toBeCloseTo(2 + 1.5 + 0.006 + 0.0004 + 0.032);
    expect(all.byCategory.email).toBeCloseTo(0.0004);
  });
});
