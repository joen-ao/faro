import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { applyOptOut, type OptOutResult } from "./optout";

type Conn = ReturnType<typeof createDb>;
const g = globalThis as unknown as { __faroOptOutConn?: Promise<Conn> };

/** One connection + one migration per process, shared by the route handler and the /baja page bundles. */
export function ready(): Promise<Conn> {
  return (g.__faroOptOutConn ??= (async () => {
    const conn = createDb();
    await migrate(conn);
    return conn;
  })());
}

/** Server-side entry used by the route handler and the /baja page. */
export async function handleOptOut(token: string): Promise<OptOutResult> {
  const conn = await ready();
  return applyOptOut(conn.db, token);
}
