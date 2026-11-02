import { NextResponse } from "next/server";
import { MetaAdsError } from "@/integrations/meta-ads";

/** Maps a Meta failure to a JSON response; messages are already token-free (redactToken in the adapter). */
export function metaErrorResponse(e: unknown): Response {
  if (e instanceof MetaAdsError) {
    return NextResponse.json({ ok: false, error: "meta_error", message: e.message, code: e.code ?? null }, { status: e.status === 400 ? 400 : 502 });
  }
  console.error("meta ads unexpected error", e instanceof Error ? e.name : "unknown");
  return NextResponse.json({ ok: false, error: "internal", message: "Error inesperado al hablar con Meta." }, { status: 500 });
}
