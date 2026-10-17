import { NextResponse } from "next/server";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";

/** Runs a handler with the migrated DB; a DB/migration failure becomes a clear 503. */
export async function withDb(fn: (db: AppDb) => Promise<Response>): Promise<Response> {
  let db: AppDb;
  try {
    db = (await getReadyDb()) as unknown as AppDb;
  } catch (e) {
    console.error("db unavailable", e);
    return NextResponse.json({ error: "Base de datos no disponible: falló la migración automática. Revisa DATABASE_URL o ejecuta npm run db:migrate." }, { status: 503 });
  }
  return fn(db);
}
