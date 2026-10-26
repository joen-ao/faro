import { NextResponse } from "next/server";
import { getOutreachMetrics } from "@/features/metrics/outreach";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

/** F26 · contacted / opened / replied by channel and day (real data only). */
export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  return withDb(async (db) => NextResponse.json(await getOutreachMetrics(db)));
}
