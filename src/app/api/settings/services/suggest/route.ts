import { NextResponse } from "next/server";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { handleServicesSuggest } from "@/features/offer/api";
import { dbCallRecorder, loadAiRates, recordAiCost } from "@/features/scoring/cost";
import { getAnthropic } from "@/integrations/anthropic";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

/** Claude proposes a service catalog from a free description of the business; the team edits it before saving. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ error: raw.error }, { status: 400 });
  return withDb(async (db) => {
    const res = await handleServicesSuggest(raw.json, {
      ai: getAnthropic(),
      recorder: dbCallRecorder(db),
      recordCost: async (r) => {
        await recordAiCost(db, { usage: r.usage, rates: await loadAiRates(db), isMock: r.isMock, evidence: `${r.task} ${r.model}` });
      },
    });
    return NextResponse.json(res.body, { status: res.status });
  });
}
