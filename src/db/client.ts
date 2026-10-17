import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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

let singleton: ReturnType<typeof createDb> | undefined;
export function getDb() {
  return (singleton ??= createDb());
}
