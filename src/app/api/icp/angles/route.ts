import { NextResponse } from "next/server";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { handleOfferAngles } from "@/features/offer/api";
import { dbCallRecorder, loadAiRates, recordAiCost } from "@/features/scoring/cost";
import { getAnthropic } from "@/integrations/anthropic";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

/** With the parsed ICP and the chosen services, Claude proposes 2–3 value angles and 1–2 profile refinements. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ error: raw.error }, { status: 400 });
  return withDb(async (db) => {
    const res = await handleOfferAngles(raw.json, {
      ai: getAnthropic(),
      recorder: dbCallRecorder(db),
      recordCost: async (r) => {
        await recordAiCost(db, { usage: r.usage, rates: await loadAiRates(db), isMock: r.isMock, evidence: `${r.task} ${r.model}` });
      },
    });
    return NextResponse.json(res.body, { status: res.status });
  });
}
