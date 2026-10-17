import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { processWhatsappWebhook, verifyWhatsappSecret, whatsappWebhookSchema } from "@/integrations/whatsapp/webhook";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!getEnv().WHATSAPP_ENABLED) return NextResponse.json({ ok: false, error: "whatsapp_disabled" }, { status: 404 });
  if (!verifyWhatsappSecret(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 64 * 1024) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = whatsappWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const r = await processWhatsappWebhook(getDb().db, parsed.data);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, duplicate: r.duplicate, lead_id: r.leadId, event: r.event, opted_out: r.optedOut, cost_usd: r.costUsd });
}
