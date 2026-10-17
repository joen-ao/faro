import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { handleIcpParse } from "@/features/icp/api";
import { dbCallRecorder, loadAiRates, recordAiCost } from "@/features/scoring/cost";
import { getAnthropic } from "@/integrations/anthropic";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const { db } = getDb();
  const res = await handleIcpParse(json, {
    ai: getAnthropic(),
    recorder: dbCallRecorder(db),
    recordCost: async (r) => {
      await recordAiCost(db, { usage: r.usage, rates: await loadAiRates(db), isMock: r.isMock, evidence: `icp_parse ${r.model}` });
    },
  });
  return NextResponse.json(res.body, { status: res.status });
}
