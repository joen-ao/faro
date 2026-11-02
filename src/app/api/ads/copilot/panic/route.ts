import { NextResponse } from "next/server";
import { apiCallLogger } from "@/features/ads";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { pauseAllFaroCampaigns } from "@/features/copilot";
import { getMetaAds } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** F29-B · Panic button: pause every campaign the copilot created. No guardrail: it only lowers spend. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  return withDb(async (db) => {
    try {
      return NextResponse.json({ ok: true, ...(await pauseAllFaroCampaigns(db, getMetaAds(getEnv(), apiCallLogger(db)))) });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
