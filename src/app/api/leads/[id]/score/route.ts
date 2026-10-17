import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { handleLeadScore } from "@/features/scoring/api";
import { getAnthropic } from "@/integrations/anthropic";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const res = await handleLeadScore(getDb().db, id, json, { ai: getAnthropic() });
  return NextResponse.json(res.body, { status: res.status });
}
