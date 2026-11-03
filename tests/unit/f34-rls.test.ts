import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  conn = await createTestDb();
});
afterAll(() => conn.close());

describe("F34 · RLS on every public table", () => {
  it("leaves no table in public without row level security", async () => {
    const res = await conn.db.execute<{ relname: string }>(
      sql`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    const rows = (res as unknown as { rows?: { relname: string }[] }).rows ?? (res as unknown as { relname: string }[]);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("keeps the app (table owner) able to read and write", async () => {
    await conn.db.execute(sql`insert into workspaces (name) values ('rls-check')`);
    const res = await conn.db.execute<{ n: number }>(sql`select count(*)::int as n from workspaces where name = 'rls-check'`);
    const rows = (res as unknown as { rows?: { n: number }[] }).rows ?? (res as unknown as { n: number }[]);
    expect(rows[0]!.n).toBe(1);
  });
});
