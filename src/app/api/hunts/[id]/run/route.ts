import { NextResponse } from "next/server";
import { isHuntSource } from "@/features/hunts/batch";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { requireAppAccess } from "@/lib/app-access";
import { errorResponse, UUID } from "@/features/hunts/http";
import { runBatch } from "@/features/hunts/service";
import { defaultSourceDeps } from "@/features/hunts/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One batch of one source: `?source=osm|rues|reps&cursor=N` (cursor optional: resumes from the persisted one). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const source = url.searchParams.get("source");
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw === null || cursorRaw === "" ? undefined : Number(cursorRaw);
  if (!UUID.test(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });
  if (!isHuntSource(source)) return NextResponse.json({ error: "source debe ser osm, rues o reps" }, { status: 400 });
  if (cursor !== undefined && (!Number.isInteger(cursor) || cursor < 0)) return NextResponse.json({ error: "cursor invalido" }, { status: 400 });
  try {
    return NextResponse.json(await runBatch(((await getReadyDb()) as unknown as AppDb), id, source, cursor, defaultSourceDeps()));
  } catch (e) {
    return errorResponse(e);
  }
}
