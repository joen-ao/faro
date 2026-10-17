import { NextResponse } from "next/server";
import { z } from "zod";
import { getLeadReceipt } from "@/features/metrics";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await ctx.params;
  if (!z.string().uuid().safeParse(leadId).success) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });
  return withDb(async (db) => {
    const receipt = await getLeadReceipt(db, leadId);
    return receipt ? NextResponse.json(receipt) : NextResponse.json({ error: "lead not found" }, { status: 404 });
  });
}
