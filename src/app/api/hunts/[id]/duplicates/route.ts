import { NextResponse } from "next/server";
import { getReadyDb } from "@/db/client";
import { requireAppAccess } from "@/lib/app-access";
import type { AppDb } from "@/db/types";
import { getHuntDuplicates } from "@/features/dedupe/dedupe";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pairs fused by F07 for a hunt: `{ merged, pairs[] }` for the "N duplicados fusionados" detail. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid hunt id" }, { status: 400 });
  const result = await getHuntDuplicates((await getReadyDb()) as unknown as AppDb, id);
  if (!result.found) return NextResponse.json({ error: "hunt not found" }, { status: 404 });
  return NextResponse.json({ merged: result.merged, pairs: result.pairs });
}
