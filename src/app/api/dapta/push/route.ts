import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { getDaptaAdapter } from "@/integrations/dapta";
import { selectLeadsForDapta } from "@/integrations/dapta/leads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** http_push mode: sends the non-suppressed leads of a hunt (`?hunt_id=`) to Dapta. Honours SEND_ENABLED. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const env = getEnv();
  const huntId = new URL(req.url).searchParams.get("hunt_id") ?? undefined;
  if (huntId !== undefined && !z.string().uuid().safeParse(huntId).success) {
    return Response.json({ ok: false, error: "invalid_hunt_id" }, { status: 400 });
  }
  const records = await selectLeadsForDapta(getDb().db, { huntId, appUrl: env.NEXT_PUBLIC_APP_URL });
  const result = await getDaptaAdapter(env).push(records);
  return NextResponse.json({ ok: result.status !== "failed", mode: env.DAPTA_MODE, ...result });
}
