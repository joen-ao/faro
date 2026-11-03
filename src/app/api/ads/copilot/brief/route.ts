import { NextResponse } from "next/server";
import { z } from "zod";
import { allowedAdHosts } from "@/features/ads";
import { briefFromText } from "@/features/copilot";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { dbCallRecorder, loadAiRates, recordAiCost } from "@/features/scoring/cost";
import { getServiceCatalog } from "@/features/settings/services";
import { AiError, getAnthropic } from "@/integrations/anthropic";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ text: z.string().trim().min(5, "Describe la campaña en una frase").max(1000) });

/** F33 · One sentence -> editable brief (catalog service, allowed destination, budget, audience). Nothing touches Meta. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: raw.error === "too_large" ? 413 : 400 });
  const body = Body.safeParse(raw.json);
  if (!body.success) return NextResponse.json({ ok: false, error: "invalid", message: body.error.issues[0]?.message }, { status: 400 });
  const env = getEnv();
  return withDb(async (db) => {
    const catalog = await getServiceCatalog(db);
    const ai = getAnthropic(env);
    try {
      const res = await briefFromText(
        body.data.text,
        { services: catalog.services.map((s) => ({ id: s.id, name: s.name, description: s.description, price: s.price })), allowedHosts: allowedAdHosts(env), maxBudget: env.ADS_MAX_DAILY_BUDGET_COP },
        ai,
        { recorder: dbCallRecorder(db) },
      );
      await recordAiCost(db, { usage: res.usage, rates: await loadAiRates(db), isMock: res.is_mock, evidence: `ad_brief ${res.model}` });
      return NextResponse.json({ ok: true, mock: res.is_mock, brief: res.brief, missing: res.missing, question: res.question, warnings: res.warnings });
    } catch (e) {
      if (e instanceof AiError) {
        await recordAiCost(db, { usage: e.usage, rates: await loadAiRates(db), isMock: e.isMock, evidence: `ad_brief ${e.model} (fallido)` });
        return NextResponse.json({ ok: false, error: "ai_failed", message: "Claude no pudo leer la descripción. Intenta de nuevo o llena el formulario." }, { status: 502 });
      }
      throw e;
    }
  });
}
