import { and, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { metricsSnapshots } from "@/db/schema";
import type { AppDb } from "@/db/types";

/**
 * F31 · Precomputed metrics. The heavy queries (tens of thousands of leads and cost entries) run at most
 * once at a time per (key, range) and the pages read the stored JSON.
 *
 * Concurrency guard: `pg_try_advisory_xact_lock(hashtext(key || ':' || range))` inside the transaction that
 * computes and upserts. Transaction-scoped on purpose: production goes through Supabase's transaction pooler,
 * where a session lock and its unlock may land on different backends and leak.
 */

export interface Snapshot<T> {
  data: T;
  /** ISO timestamp of the computation. */
  computedAt: string;
  durationMs: number;
  /** Older than maxAge: shown while a refresh runs in the background. */
  stale: boolean;
}

export const DEFAULT_MAX_AGE_MIN = 15;

type Compute<T> = (db: AppDb) => Promise<T>;
type Schedule = (task: () => Promise<unknown>) => void;

/** Next's `after()`: runs once the response is sent (needs a request scope). */
const scheduleAfter: Schedule = (task) => after(task);

/** Stored row, or null. Never computes. */
export async function readSnapshot<T>(db: AppDb, key: string, rangeDays: number, maxAgeMin = DEFAULT_MAX_AGE_MIN, now = new Date()): Promise<Snapshot<T> | null> {
  const [row] = await db
    .select()
    .from(metricsSnapshots)
    .where(and(eq(metricsSnapshots.key, key), eq(metricsSnapshots.rangeDays, rangeDays)))
    .limit(1);
  if (!row) return null;
  const computedAt = new Date(row.computedAt);
  return {
    data: row.data as T,
    computedAt: computedAt.toISOString(),
    durationMs: row.durationMs,
    stale: now.getTime() - computedAt.getTime() >= maxAgeMin * 60_000,
  };
}

/**
 * Recomputes and stores the snapshot unless another recompute holds the lock (then returns null).
 * With `ifOlderThanMin`, a snapshot that became fresh while waiting is kept (no duplicate work).
 */
export async function refreshSnapshot<T>(
  db: AppDb,
  key: string,
  rangeDays: number,
  compute: Compute<T>,
  opts: { ifOlderThanMin?: number } = {},
): Promise<Snapshot<T> | null> {
  return db.transaction(async (tx) => {
    const t = tx as unknown as AppDb;
    const lock = await rows<{ ok: boolean }>(t, sql`select pg_try_advisory_xact_lock(hashtext(${`${key}:${rangeDays}`})) as ok`);
    if (!lock[0]?.ok) return null;
    if (opts.ifOlderThanMin !== undefined) {
      const cur = await readSnapshot<T>(t, key, rangeDays, opts.ifOlderThanMin);
      if (cur && !cur.stale) return cur;
    }
    const started = Date.now();
    // JSON round-trip: dates become ISO strings, exactly what a later read returns.
    const data = JSON.parse(JSON.stringify(await compute(t))) as T;
    const durationMs = Date.now() - started;
    const computedAt = new Date();
    await t
      .insert(metricsSnapshots)
      .values({ key, rangeDays, data, computedAt, durationMs })
      .onConflictDoUpdate({ target: [metricsSnapshots.key, metricsSnapshots.rangeDays], set: { data, computedAt, durationMs } });
    return { data, computedAt: computedAt.toISOString(), durationMs, stale: false };
  });
}

/**
 * Fresh (< maxAgeMin) -> stored copy. Stale -> stored copy now, refresh scheduled in the background.
 * Missing -> computed inline once (if another request is already computing it, waits for that copy).
 */
export async function getSnapshot<T>(
  db: AppDb,
  key: string,
  rangeDays: number,
  maxAgeMin: number,
  compute: Compute<T>,
  opts: { schedule?: Schedule } = {},
): Promise<Snapshot<T>> {
  const cur = await readSnapshot<T>(db, key, rangeDays, maxAgeMin);
  if (cur) {
    if (cur.stale) {
      (opts.schedule ?? scheduleAfter)(() =>
        refreshSnapshot(db, key, rangeDays, compute, { ifOlderThanMin: maxAgeMin }).catch((e) => {
          console.error(`[snapshot] background refresh ${key}:${rangeDays} failed`, e instanceof Error ? e.message : e);
        }),
      );
    }
    return cur;
  }
  const fresh = await refreshSnapshot(db, key, rangeDays, compute, { ifOlderThanMin: maxAgeMin });
  if (fresh) return fresh;
  // Someone else holds the lock: wait for their copy (bounded), else compute without storing.
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const done = await readSnapshot<T>(db, key, rangeDays, maxAgeMin);
    if (done) return done;
  }
  const data = JSON.parse(JSON.stringify(await compute(db))) as T;
  return { data, computedAt: new Date().toISOString(), durationMs: 0, stale: false };
}

async function rows<T>(db: AppDb, q: ReturnType<typeof sql>): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as T[] | { rows: T[] };
  return Array.isArray(r) ? r : r.rows;
}
