import { NextResponse } from "next/server";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { dailyOutreachInput, emailsToday, getDailyOutreach, runDailyOutreach, saveDailyOutreach } from "@/features/outreach/daily";
import { getAnthropic } from "@/integrations/anthropic";
import { getEmail } from "@/integrations/email";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  return withDb(async (db) => NextResponse.json({ ok: true, ...(await getDailyOutreach(db)), sentToday: await emailsToday(db, new Date()) }));
}

/** Saves on/off, emails per day and hunts. */
export async function PUT(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: 400 });
  const body = dailyOutreachInput.safeParse(raw.json);
  if (!body.success) return NextResponse.json({ ok: false, error: "invalid", issues: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  return withDb(async (db) => NextResponse.json({ ok: true, setting: await saveDailyOutreach(db, body.data) }));
}

/** "Ejecutar ahora": runs today's batch immediately (same quota, window and rules as the cron). */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const env = getEnv();
  return withDb(async (db) => NextResponse.json({ ok: true, summary: await runDailyOutreach(db, { ai: getAnthropic(env), email: getEmail(env), env }, { trigger: "manual" }) }));
}
