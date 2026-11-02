import { NextResponse } from "next/server";
import { z } from "zod";
import { activationRefusal, apiCallLogger } from "@/features/ads";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { getMetaAds } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

const body = z.object({ status: z.enum(["ACTIVE", "PAUSED"]), confirmName: z.string().max(200).default("") });

const REFUSALS = {
  spend_disabled: "Activar está bloqueado: ADS_SPEND_ENABLED=false. Faro no gasta dinero hasta que el equipo lo habilite.",
  confirm_mismatch: "Escribe el nombre exacto de la campaña para confirmar.",
  over_budget: "El presupuesto diario supera ADS_MAX_DAILY_BUDGET_COP.",
  unknown_budget: "No se pudo leer el presupuesto diario de la campaña; actívala desde Meta si es correcta.",
} as const;

/** Pause always; activate only past the spend guardrail (ADS_SPEND_ENABLED + typed name + budget cap). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^\d{5,25}$/.test(id)) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: raw.error === "too_large" ? 413 : 400 });
  const parsed = body.safeParse(raw.json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const env = getEnv();
  return withDb(async (db) => {
    const ads = getMetaAds(env, apiCallLogger(db));
    try {
      if (parsed.data.status === "ACTIVE") {
        const campaign = (await ads.listCampaigns()).find((c) => c.id === id);
        if (!campaign) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
        const refusal = activationRefusal(env, campaign, parsed.data.confirmName);
        if (refusal) return NextResponse.json({ ok: false, error: refusal, message: REFUSALS[refusal] }, { status: refusal === "confirm_mismatch" ? 400 : 409 });
      }
      await ads.setCampaignStatus(id, parsed.data.status);
      return NextResponse.json({ ok: true, mock: ads.isMock, id, status: parsed.data.status });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
