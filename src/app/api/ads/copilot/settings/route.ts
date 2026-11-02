import { NextResponse } from "next/server";
import { saveCopilotSettings, SettingsSchema } from "@/features/copilot";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

/** F29-B · Copilot mode (recommend | autopilot) and the CPL / CPQL targets (COP). */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  const body = raw.ok ? SettingsSchema.safeParse(raw.json) : null;
  if (!body?.success) return NextResponse.json({ ok: false, error: "invalid", issues: body?.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  return withDb(async (db) => NextResponse.json({ ok: true, settings: await saveCopilotSettings(db, body.data) }));
}
