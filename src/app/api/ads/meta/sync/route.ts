import { NextResponse } from "next/server";
import { apiCallLogger, syncMetaAds } from "@/features/ads";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { getMetaAds } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** F28 · "Sincronizar ahora": pulls the last `?days=` (default 7) of Meta insights into ad_spend. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const days = Number(new URL(req.url).searchParams.get("days") ?? 7);
  return withDb(async (db) => {
    const env = getEnv();
    try {
      const summary = await syncMetaAds(db, getMetaAds(env, apiCallLogger(db)), env, { days: Number.isFinite(days) ? days : 7 });
      return NextResponse.json({ ok: !summary.error, summary });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
