import { NextResponse } from "next/server";
import { getChannelMetrics } from "@/features/metrics";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

/** Source x contact-channel matrix. `?demo=1` adds a separate `demo` block (never summed into `real`). */
export async function GET(req: Request) {
  const includeDemo = new URL(req.url).searchParams.get("demo") === "1";
  return withDb(async (db) => NextResponse.json(await getChannelMetrics(db, { includeDemo })));
}
