import { NextResponse } from "next/server";
import { bogotaDate } from "@/features/ads";
import { adPerformance } from "@/features/copilot";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

/** F29 · Per-ad performance (Meta + Faro leads + Dapta qualification) for the last `?days=` (default 30, max 90). */
export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 30) || 30, 1), 90);
  return withDb(async (db) => NextResponse.json({ ok: true, since: bogotaDate(days - 1), ads: await adPerformance(db, bogotaDate(days - 1)) }));
}
