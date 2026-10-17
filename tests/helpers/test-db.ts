import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";

/** In-memory PGlite with all migrations applied. Call `close()` in afterAll. */
export async function createTestDb() {
  const conn = createDb("", "memory://");
  await migrate(conn);
  return conn;
}
