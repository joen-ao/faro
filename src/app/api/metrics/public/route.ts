import { NextResponse } from "next/server";
import { getPublicMetrics } from "@/features/metrics";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

/** Aggregated numbers for the landing page: real data only, no company data. */
export async function GET() {
  return withDb(async (db) => NextResponse.json(await getPublicMetrics(db)));
}
