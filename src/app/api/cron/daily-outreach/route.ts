import { NextResponse } from "next/server";
import { runDailyOutreach } from "@/features/outreach/daily";
import { cronAuthorized } from "@/features/outreach/cron";
import { getAnthropic } from "@/integrations/anthropic";
import { getEmail } from "@/integrations/email";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** F25 · Vercel Cron (vercel.json, L–S 14:00 UTC = 9:00 Bogotá): today's batch of first emails. */
export async function GET(req: Request) {
  const env = getEnv();
  if (!cronAuthorized(req, env.CRON_SECRET)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return withDb(async (db) => {
    const summary = await runDailyOutreach(db, { ai: getAnthropic(env), email: getEmail(env), env }, { trigger: "cron" });
    return NextResponse.json({ ok: true, summary });
  });
}
