import { NextResponse } from "next/server";
import { parseRange } from "@/features/dashboard/business";
import { refreshDashboard } from "@/features/dashboard/data";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** F31 · "Actualizar ahora": recomputes the dashboard snapshots for `?range=` (7/30/90). */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const range = parseRange(new URL(req.url).searchParams.get("range"));
  return withDb(async (db) => {
    const started = Date.now();
    const r = await refreshDashboard(db, range);
    // false = another refresh held the lock; its copy is the one the page will show.
    return NextResponse.json({ ok: true, range, refreshed: r, ms: Date.now() - started });
  });
}
