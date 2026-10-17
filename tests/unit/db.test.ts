import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb } from "@/db/client";

const conn = createDb("", "memory://");
afterAll(() => conn.close());

describe("db client", () => {
  it("uses PGlite when DATABASE_URL is empty and answers select 1", async () => {
    expect(conn.kind).toBe("pglite");
    const r = (await conn.db.execute(sql`select 1 as one`)) as unknown as { rows: unknown[] };
    expect(r.rows[0]).toEqual({ one: 1 });
  });
});
