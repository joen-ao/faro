import { NextResponse } from "next/server";
import { z } from "zod";
import { getLeadReceipt } from "@/features/metrics";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

/** Internal: a receipt exposes company-level costs, so it needs the app access key (F21 NIT from F13). */
export async function GET(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const { leadId } = await ctx.params;
  if (!z.string().uuid().safeParse(leadId).success) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });
  return withDb(async (db) => {
    const receipt = await getLeadReceipt(db, leadId);
    return receipt ? NextResponse.json(receipt) : NextResponse.json({ error: "lead not found" }, { status: 404 });
  });
}
