import { NextResponse } from "next/server";
import { DEMO_HUNT_ID, ensureDemoHunt } from "@/features/hunts/demo";
import { getHuntsDb } from "@/features/hunts/db";
import { errorResponse, UUID } from "@/features/hunts/http";
import { getStream } from "@/features/hunts/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Incremental polling (chosen over SSE: works on serverless without long-lived connections).
 * `?since=<ms>` returns leads created after it; `?rev=` skips status updates when nothing changed.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });
  const q = new URL(req.url).searchParams;
  const since = Number(q.get("since") ?? 0);
  try {
    const db = await getHuntsDb();
    if (id === DEMO_HUNT_ID) await ensureDemoHunt(db);
    const r = await getStream(db, id, { since: Number.isFinite(since) ? since : 0, rev: q.get("rev") ?? undefined });
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
