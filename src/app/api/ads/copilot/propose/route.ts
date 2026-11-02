import { NextResponse } from "next/server";
import { z } from "zod";
import { destinationError } from "@/features/ads";
import { BriefSchema, learningsForProposals, proposeAds } from "@/features/copilot";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { dbCallRecorder, loadAiRates, recordAiCost } from "@/features/scoring/cost";
import { getServiceCatalog } from "@/features/settings/services";
import { AiError, getAnthropic } from "@/integrations/anthropic";
import { getMetaAds } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({ brief: BriefSchema });

/** F29 · Claude proposes 3–5 distinct ad variants for a brief; each one comes back linted by code. Nothing touches Meta. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: raw.error === "too_large" ? 413 : 400 });
  const body = Body.safeParse(raw.json);
  if (!body.success) return NextResponse.json({ ok: false, error: "invalid", issues: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  const env = getEnv();
  const { brief } = body.data;
  const dest = destinationError(brief.url, env);
  if (dest) return NextResponse.json({ ok: false, error: "invalid", issues: [`url: ${dest}`] }, { status: 400 });
  if (brief.dailyBudget > env.ADS_MAX_DAILY_BUDGET_COP) return NextResponse.json({ ok: false, error: "invalid", issues: [`dailyBudget: máximo ${env.ADS_MAX_DAILY_BUDGET_COP}`] }, { status: 400 });

  return withDb(async (db) => {
    const catalog = await getServiceCatalog(db);
    const service = catalog.services.find((x) => x.id === brief.serviceId);
    if (!service) return NextResponse.json({ ok: false, error: "invalid", issues: ["serviceId: el servicio no está en el catálogo (Tu oferta)"] }, { status: 400 });
    const ai = getAnthropic(env);
    try {
      const res = await proposeAds(
        brief,
        { service, catalogPrices: catalog.services.flatMap((x) => [x.price, x.entryOffer]), company: catalog.company, learnings: await learningsForProposals(db, getMetaAds(env).isMock) },
        ai,
        { recorder: dbCallRecorder(db) },
      );
      await recordAiCost(db, { usage: res.usage, rates: await loadAiRates(db), isMock: res.is_mock, evidence: `ad_variants ${res.model}` });
      return NextResponse.json({ ok: true, mock: res.is_mock, model: res.model, variants: res.variants });
    } catch (e) {
      if (e instanceof AiError) {
        await recordAiCost(db, { usage: e.usage, rates: await loadAiRates(db), isMock: e.isMock, evidence: `ad_variants ${e.model} (fallido)` });
        return NextResponse.json({ ok: false, error: "ai_failed", message: "Claude no devolvió variantes válidas. Intenta de nuevo o ajusta el brief." }, { status: 502 });
      }
      throw e;
    }
  });
}
