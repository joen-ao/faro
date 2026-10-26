import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";
import { selectWhatsappTargets, sendWhatsapp } from "@/features/whatsapp/send";
import { getWaSender } from "@/features/whatsapp/sender";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const mask = (p: string) => `${p.slice(0, 6)}•••${p.slice(-3)}`;
const segment = z.enum(["empresas", "independientes", "all"]).optional();

/** GET: who would receive a WhatsApp in this hunt (masked numbers), why the rest are left out, today's quota. */
export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const env = getEnv();
  return withDb(async (db) => {
    const sel = await selectWhatsappTargets(db, env, { huntId: q.get("huntId") ?? undefined, segment: segment.catch(undefined).parse(q.get("segment") ?? undefined) });
    const skippedBy: Record<string, number> = {};
    for (const s of sel.skipped) skippedBy[s.rule] = (skippedBy[s.rule] ?? 0) + 1;
    return NextResponse.json({
      enabled: env.WHATSAPP_SEND_MODE === "dapta_flow" && !!env.DAPTA_WA_FLOW_URL,
      sendEnabled: env.SEND_ENABLED === true,
      window: sel.window,
      dailyUsed: sel.dailyUsed,
      dailyLimit: sel.dailyLimit,
      total: sel.targets.length,
      byTemplate: sel.targets.reduce<Record<string, number>>((a, t) => ((a[t.template.label] = (a[t.template.label] ?? 0) + 1), a), {}),
      byPhone: sel.targets.reduce<Record<string, number>>((a, t) => ((a[t.phoneKind] = (a[t.phoneKind] ?? 0) + 1), a), {}),
      skippedBy,
      sample: sel.targets.slice(0, 50).map((t) => ({ leadId: t.leadId, company: t.company, phone: mask(t.phone), phoneKind: t.phoneKind, template: t.template.label, nombre: t.nombre })),
    });
  });
}

const Body = z.object({ huntId: z.string().uuid().optional(), leadIds: z.array(z.string().uuid()).max(200).optional(), segment, limit: z.number().int().min(1).max(200).optional() });

/** POST: sends the template to up to `limit` leads (default 20), inside the window and the daily cap. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  const env = getEnv();
  return withDb(async (db) => {
    const r = await sendWhatsapp(db, env, getWaSender(env), { ...parsed.data, limit: parsed.data.limit ?? 20 });
    return NextResponse.json(r, { status: r.ok ? 200 : r.error === "whatsapp_send_disabled" ? 409 : 422 });
  });
}
