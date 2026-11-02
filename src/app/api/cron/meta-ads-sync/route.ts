import { NextResponse } from "next/server";
import { apiCallLogger, syncMetaAds } from "@/features/ads";
import { evaluateCopilot, runLearnings } from "@/features/copilot";
import { getAnthropic } from "@/integrations/anthropic";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { cronAuthorized } from "@/features/outreach/cron";
import { getMetaAds } from "@/integrations/meta-ads";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** F28 · Vercel Cron (vercel.json, daily 11:00 UTC = 6:00 Bogotá): last 7 days of Meta insights -> ad_spend, then F29 rules (and learnings on Mondays). */
export async function GET(req: Request) {
  const env = getEnv();
  if (!cronAuthorized(req, env.CRON_SECRET)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return withDb(async (db) => {
    try {
      const ads = getMetaAds(env, apiCallLogger(db));
      const summary = await syncMetaAds(db, ads, env, { days: 7 });
      // F29-B: evaluate rules on fresh data (autopilot only lowers spend). A rules failure never hides the sync result.
      const copilot = summary.error ? null : await evaluateCopilot(db, ads, env).catch((e: unknown) => ({ error: e instanceof Error ? e.message : "copilot failed" }));
      // F29-C: weekly learnings on Mondays (Bogotá), inside this cron to stay within the plan's cron limit.
      const monday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", weekday: "short" }).format(new Date()) === "Mon";
      const learnings = monday ? await runLearnings(db, getAnthropic(env), ads.isMock).catch((e: unknown) => ({ error: e instanceof Error ? e.message : "learnings failed" })) : null;
      return NextResponse.json({ ok: !summary.error, summary, copilot, learnings });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
