import { NextResponse } from "next/server";
import { apiCallLogger, syncMetaAds } from "@/features/ads";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { cronAuthorized } from "@/features/outreach/cron";
import { getMetaAds } from "@/integrations/meta-ads";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** F28 · Vercel Cron (vercel.json, daily 11:00 UTC = 6:00 Bogotá): last 7 days of Meta insights -> ad_spend. */
export async function GET(req: Request) {
  const env = getEnv();
  if (!cronAuthorized(req, env.CRON_SECRET)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return withDb(async (db) => {
    try {
      const summary = await syncMetaAds(db, getMetaAds(env, apiCallLogger(db)), env, { days: 7 });
      return NextResponse.json({ ok: !summary.error, summary });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
