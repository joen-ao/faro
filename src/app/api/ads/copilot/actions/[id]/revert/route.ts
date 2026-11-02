import { NextResponse } from "next/server";
import { apiCallLogger } from "@/features/ads";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { revertAction } from "@/features/copilot";
import { getMetaAds } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** F29-B · Human-only undo of a logged action (spend guardrails apply when undoing raises spend). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const env = getEnv();
  return withDb(async (db) => {
    try {
      const res = await revertAction(db, getMetaAds(env, apiCallLogger(db)), env, id);
      return NextResponse.json(res, { status: res.ok ? 200 : 409 });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
