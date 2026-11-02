import { NextResponse } from "next/server";
import { apiCallLogger } from "@/features/ads";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { evaluateCopilot } from "@/features/copilot";
import { getMetaAds } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** F29-B · "Evaluar ahora": runs the rules; in autopilot it also executes the spend-lowering ones. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const env = getEnv();
  return withDb(async (db) => {
    try {
      return NextResponse.json({ ok: true, summary: await evaluateCopilot(db, getMetaAds(env, apiCallLogger(db)), env) });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
