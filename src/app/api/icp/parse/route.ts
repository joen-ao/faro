import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { handleIcpParse } from "@/features/icp/api";
import { dbCallRecorder } from "@/features/scoring/cost";
import { getAnthropic } from "@/integrations/anthropic";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const res = await handleIcpParse(json, { ai: getAnthropic(), recorder: dbCallRecorder(getDb().db) });
  return NextResponse.json(res.body, { status: res.status });
}
