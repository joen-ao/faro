import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { markManualReply } from "@/features/replies/service";
import { requireAppAccess } from "@/lib/app-access";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalido" }, { status: 400 });
  }
  const res = await markManualReply(getDb().db, id, json);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, status: res.status, event_id: res.eventId });
}
