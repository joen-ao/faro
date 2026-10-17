import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "./migrate";
import * as schema from "./schema";

export const PGLITE_DIR = "./.pglite";

/**
 * DATABASE_URL empty -> PGlite persisted in ./.pglite (pass `dataDir: "memory://"` for tests).
 * Otherwise a real Postgres (Supabase) connection.
 */
export function createDb(databaseUrl: string | undefined = process.env.DATABASE_URL, pgliteDir: string = PGLITE_DIR) {
  if (databaseUrl) {
    const client = postgres(databaseUrl, { max: 5 });
    return { kind: "postgres" as const, db: drizzlePg(client, { schema }), close: () => client.end() };
  }
  const client = new PGlite(pgliteDir);
  return { kind: "pglite" as const, db: drizzlePglite(client, { schema }), close: () => client.close() };
}

// Shared through globalThis: Next bundles each route separately, and two PGlite instances on one dir diverge.
const g = globalThis as unknown as { __faroDb?: ReturnType<typeof createDb> };
export function getDb() {
  return (g.__faroDb ??= createDb());
}

const ready = new WeakMap<object, Promise<void>>();

/** Applies migrations once per connection (memoized; idempotent on PGlite and Postgres). A failure is not cached. */
export function ensureMigrated(conn: ReturnType<typeof createDb>): Promise<void> {
  let p = ready.get(conn);
  if (!p) {
    p = migrate(conn).catch((e) => {
      ready.delete(conn);
      throw e;
    });
    ready.set(conn, p);
  }
  return p;
}

/** The singleton DB, migrated on first use. Use this in route handlers. */
export async function getReadyDb(conn: ReturnType<typeof createDb> = getDb()) {
  await ensureMigrated(conn);
  return conn.db;
}
