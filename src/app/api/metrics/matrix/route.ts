import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getChannelMetrics } from "@/features/metrics";

export const dynamic = "force-dynamic";

/** Source x contact-channel matrix. `?demo=1` adds a separate `demo` block (never summed into `real`). */
export async function GET(req: Request) {
  const includeDemo = new URL(req.url).searchParams.get("demo") === "1";
  return NextResponse.json(await getChannelMetrics(getDb().db, { includeDemo }));
}
