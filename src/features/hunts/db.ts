import { getDb } from "@/db/client";
import { migrate, type MigratableConn } from "@/db/migrate";
import { seedCostRates } from "@/db/seed";
import type { AppDb } from "@/db/types";

let ready: Promise<AppDb> | undefined;

/** Shared database with migrations applied once per process (PGlite needs them on first use). */
export function getHuntsDb(): Promise<AppDb> {
  return (ready ??= (async () => {
    const conn = getDb();
    await migrate(conn as MigratableConn);
    const db = conn.db as unknown as AppDb;
    await seedCostRates(db);
    return db;
  })().catch((e) => {
    ready = undefined;
    throw e;
  }));
}
