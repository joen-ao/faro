import { NextResponse } from "next/server";
import { apiCallLogger, campaignInputSchema } from "@/features/ads";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { getMetaAds } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Lists the ad account's campaigns, live from Meta. */
export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  return withDb(async (db) => {
    const ads = getMetaAds(getEnv(), apiCallLogger(db));
    try {
      return NextResponse.json({ ok: true, mock: ads.isMock, campaigns: await ads.listCampaigns() });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}

/** Creates campaign + ad set + creative + ad, all PAUSED. Activation is a separate, guarded step. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: raw.error === "too_large" ? 413 : 400 });
  const env = getEnv();
  const input = campaignInputSchema(env).safeParse(raw.json);
  if (!input.success) {
    return NextResponse.json({ ok: false, error: "invalid", issues: input.error.issues.map((i) => `${i.path.join(".") || "campaña"}: ${i.message}`) }, { status: 400 });
  }
  return withDb(async (db) => {
    const ads = getMetaAds(env, apiCallLogger(db));
    try {
      return NextResponse.json({ ok: true, mock: ads.isMock, created: await ads.createPausedCampaign(input.data) });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
