import { NextResponse } from "next/server";
import { z } from "zod";
import { apiCallLogger } from "@/features/ads";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { applyRecommendation, dismissRecommendation } from "@/features/copilot";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { getMetaAds } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

const Body = z.object({ decision: z.enum(["apply", "dismiss"]) });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** F29-B · A human approves (applies) or dismisses a recommendation. Hard limits are re-checked on apply. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const raw = await readJsonCapped(req);
  const body = raw.ok ? Body.safeParse(raw.json) : null;
  if (!body?.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const env = getEnv();
  return withDb(async (db) => {
    if (body.data.decision === "dismiss") {
      const ok = await dismissRecommendation(db, id);
      return NextResponse.json({ ok }, { status: ok ? 200 : 409 });
    }
    try {
      const res = await applyRecommendation(db, getMetaAds(env, apiCallLogger(db)), env, id, "human");
      return NextResponse.json(res, { status: res.ok ? 200 : 409 });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
