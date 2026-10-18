import { NextResponse } from "next/server";
import { checkSendWindow } from "@/features/compliance/windows";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { getSendWindow, saveSendWindow, sendWindowInput } from "@/features/settings/send-window";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

const view = (setting: Parameters<typeof checkSendWindow>[2]) => {
  const w = checkSendWindow(new Date(), "CO", setting);
  return { allowed: w.allowed, reason: w.reason, nextAllowedAt: w.nextAllowedAt?.toISOString() ?? null };
};

/** Active send window (panel setting or env fallback) and whether it is open right now. */
export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  return withDb(async (db) => {
    const s = await getSendWindow(db);
    return NextResponse.json({ ok: true, ...s, now: view(s.setting) });
  });
}

/** Saves the team's send window (hours and weekdays, America/Bogota). */
export async function PUT(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: 400 });
  const body = sendWindowInput.safeParse(raw.json);
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "invalid", issues: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  }
  return withDb(async (db) => {
    const setting = await saveSendWindow(db, body.data);
    return NextResponse.json({ ok: true, setting, origin: "panel", now: view(setting) });
  });
}
