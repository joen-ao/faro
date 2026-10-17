import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { getLeadReceipt } from "@/features/metrics";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await ctx.params;
  if (!z.string().uuid().safeParse(leadId).success) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });
  const receipt = await getLeadReceipt(getDb().db, leadId);
  if (!receipt) return NextResponse.json({ error: "lead not found" }, { status: 404 });
  return NextResponse.json(receipt);
}
