import { NextResponse } from "next/server";
import { z } from "zod";
import { listAdSpend, saveAdSpend, spendRowSchema } from "@/features/ads";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

const bodySchema = spendRowSchema.extend({ isDemo: z.boolean().default(false) });

/** Lists loaded ad spend (newest first). */
export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  return withDb(async (db) => NextResponse.json({ ok: true, rows: await listAdSpend(db) }));
}

/** Manual single-row spend entry; re-attributes the campaign cost across real leads (F13). */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: raw.error === "too_large" ? 413 : 400 });
  const body = bodySchema.safeParse(raw.json);
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "invalid", issues: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  }
  const { isDemo, ...row } = body.data;
  return withDb(async (db) => NextResponse.json({ ok: true, ...(await saveAdSpend(db, [row], { isDemo })) }));
}
