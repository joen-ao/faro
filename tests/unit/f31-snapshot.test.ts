import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { metricsSnapshots } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { getSnapshot, readSnapshot, refreshSnapshot } from "@/features/dashboard/snapshot";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
let db: AppDb;
beforeAll(async () => {
  conn = await createTestDb();
  db = conn.db as unknown as AppDb;
});
afterAll(() => conn.close());
beforeEach(async () => {
  await db.delete(metricsSnapshots);
});

const ageBy = (min: number) => db.update(metricsSnapshots).set({ computedAt: sql`now() - make_interval(mins => ${min})` });

describe("getSnapshot", () => {
  it("missing: computes inline once and stores it (dates become ISO strings)", async () => {
    const compute = vi.fn(async () => ({ n: 1, at: new Date("2026-11-01T10:00:00Z") }));
    const schedule = vi.fn();
    const s = await getSnapshot(db, "k", 30, 15, compute, { schedule });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
    expect(s.stale).toBe(false);
    expect(s.data).toEqual({ n: 1, at: "2026-11-01T10:00:00.000Z" });
    expect((await readSnapshot(db, "k", 30))?.data).toEqual(s.data);
  });

  it("fresh: returns the stored copy without computing", async () => {
    await refreshSnapshot(db, "k", 30, async () => ({ n: 1 }));
    const compute = vi.fn(async () => ({ n: 2 }));
    const schedule = vi.fn();
    const s = await getSnapshot(db, "k", 30, 15, compute, { schedule });
    expect(s.data).toEqual({ n: 1 });
    expect(compute).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("stale: returns the old copy now and schedules one background refresh", async () => {
    await refreshSnapshot(db, "k", 30, async () => ({ n: 1 }));
    await ageBy(20);
    const compute = vi.fn(async () => ({ n: 2 }));
    const tasks: (() => Promise<unknown>)[] = [];
    const s = await getSnapshot(db, "k", 30, 15, compute, { schedule: (t) => tasks.push(t) });
    expect(s.stale).toBe(true);
    expect(s.data).toEqual({ n: 1 });
    expect(compute).not.toHaveBeenCalled();
    expect(tasks).toHaveLength(1);
    await tasks[0]();
    expect(compute).toHaveBeenCalledTimes(1);
    const after = await readSnapshot<{ n: number }>(db, "k", 30, 15);
    expect(after?.data.n).toBe(2);
    expect(after?.stale).toBe(false);
  });

  it("keys and ranges are independent", async () => {
    await refreshSnapshot(db, "k", 7, async () => ({ r: 7 }));
    await refreshSnapshot(db, "k", 90, async () => ({ r: 90 }));
    expect((await readSnapshot(db, "k", 7))?.data).toEqual({ r: 7 });
    expect((await readSnapshot(db, "k", 90))?.data).toEqual({ r: 90 });
    expect(await readSnapshot(db, "other", 7)).toBeNull();
  });
});

describe("refreshSnapshot lock", () => {
  it("concurrent stale refreshes compute once (the second finds a fresh copy)", async () => {
    let calls = 0;
    const compute = async () => ({ n: ++calls });
    const [a, b] = await Promise.all([
      refreshSnapshot(db, "k", 30, compute, { ifOlderThanMin: 15 }),
      refreshSnapshot(db, "k", 30, compute, { ifOlderThanMin: 15 }),
    ]);
    expect(calls).toBe(1);
    expect(a?.data).toEqual({ n: 1 });
    expect(b?.data).toEqual({ n: 1 });
  });

  it("does not compute when another recompute holds the advisory lock", async () => {
    const executed: string[] = [];
    const tx = {
      execute: async (q: unknown) => {
        executed.push(JSON.stringify(q));
        return [{ ok: false }];
      },
    };
    const fake = { transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) } as unknown as AppDb;
    const compute = vi.fn(async () => ({ n: 1 }));
    expect(await refreshSnapshot(fake, "k", 30, compute)).toBeNull();
    expect(compute).not.toHaveBeenCalled();
    expect(executed[0]).toContain("pg_try_advisory_xact_lock");
  });

  it("forced refresh replaces a fresh copy", async () => {
    await refreshSnapshot(db, "k", 30, async () => ({ n: 1 }));
    const s = await refreshSnapshot(db, "k", 30, async () => ({ n: 2 }));
    expect(s?.data).toEqual({ n: 2 });
    expect((await readSnapshot(db, "k", 30))?.data).toEqual({ n: 2 });
  });
});
