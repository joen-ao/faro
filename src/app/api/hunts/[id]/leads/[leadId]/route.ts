import { NextResponse } from "next/server";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { requireAppAccess } from "@/lib/app-access";
import { errorResponse, UUID } from "@/features/hunts/http";
import { getLeadDetail } from "@/features/hunts/service";

export const dynamic = "force-dynamic";

/** Drawer payload: company, sources + licences, generic contacts, fit with evidence, events, cost lines. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; leadId: string }> }) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const { id, leadId } = await ctx.params;
  if (!UUID.test(id) || !UUID.test(leadId)) return NextResponse.json({ error: "id invalido" }, { status: 400 });
  try {
    return NextResponse.json(await getLeadDetail(((await getReadyDb()) as unknown as AppDb), id, leadId), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
