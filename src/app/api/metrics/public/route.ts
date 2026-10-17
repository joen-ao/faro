import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getPublicMetrics } from "@/features/metrics";

export const dynamic = "force-dynamic";

/** Aggregated numbers for the landing page: real data only, no company data. */
export async function GET() {
  return NextResponse.json(await getPublicMetrics(getDb().db));
}
