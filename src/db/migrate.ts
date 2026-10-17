import path from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "src/db/migrations");

export type MigratableConn =
  | { kind: "pglite"; db: PgliteDatabase<typeof schema> }
  | { kind: "postgres"; db: PostgresJsDatabase<typeof schema> };

/** Applies versioned migrations; idempotent. Works on PGlite and real Postgres. */
export async function migrate(conn: MigratableConn, migrationsFolder: string = MIGRATIONS_FOLDER): Promise<void> {
  if (conn.kind === "pglite") await migratePglite(conn.db, { migrationsFolder });
  else await migratePg(conn.db, { migrationsFolder });
}
