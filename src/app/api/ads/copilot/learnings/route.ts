import { NextResponse } from "next/server";
import { runLearnings } from "@/features/copilot";
import { getAnthropic } from "@/integrations/anthropic";
import { getMetaAds } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** F29-C · "Generar aprendizajes ahora". */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const env = getEnv();
  return withDb(async (db) => NextResponse.json({ ok: true, result: await runLearnings(db, getAnthropic(env), getMetaAds(env).isMock) }));
}
