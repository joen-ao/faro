import { NextResponse } from "next/server";
import { apiCallLogger } from "@/features/ads";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { CreateBody, createCopilotCampaign } from "@/features/copilot";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { getServiceCatalog } from "@/features/settings/services";
import { getMetaAds } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** F29 · Creates 1 campaign → 1 ad set → N ads from approved variants, all PAUSED, and records each ad's concept. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: raw.error === "too_large" ? 413 : 400 });
  const body = CreateBody.safeParse(raw.json);
  if (!body.success) return NextResponse.json({ ok: false, error: "invalid", issues: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  const env = getEnv();
  return withDb(async (db) => {
    const catalog = await getServiceCatalog(db);
    try {
      const out = await createCopilotCampaign(db, getMetaAds(env, apiCallLogger(db)), env, body.data, catalog.services.flatMap((x) => [x.price, x.entryOffer]));
      if (!out.ok) return NextResponse.json(out, { status: 400 });
      return NextResponse.json({ ok: true, mock: out.created.isMock, created: out.created, briefId: out.briefId });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
