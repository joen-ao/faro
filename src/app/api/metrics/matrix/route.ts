import { NextResponse } from "next/server";
import { getChannelMetrics } from "@/features/metrics";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

/** Source x contact-channel matrix (real data only). */
export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  return withDb(async (db) => NextResponse.json(await getChannelMetrics(db)));
}
