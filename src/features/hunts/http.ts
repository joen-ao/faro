import { NextResponse } from "next/server";
import { HuntError } from "./service";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Maps domain errors to JSON responses; anything else is a 500 without leaking internals. */
export function errorResponse(e: unknown) {
  if (e instanceof HuntError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[hunts]", e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "Error interno" }, { status: 500 });
}
