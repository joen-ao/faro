import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { normalizeDaptaNative, payloadShape } from "@/integrations/dapta/native";
import { daptaWebhookSchema, processDaptaWebhook, verifyWebhookSecret } from "@/integrations/dapta/webhook";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!verifyWebhookSecret(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  // Faro's own format first (Flow Studio / http_push); otherwise Dapta's native post-conversation analysis.
  let parsed = daptaWebhookSchema.safeParse(body);
  if (!parsed.success) parsed = daptaWebhookSchema.safeParse(normalizeDaptaNative(body));
  if (!parsed.success) {
    console.warn("[dapta-webhook] unrecognised payload shape", payloadShape(body));
    return NextResponse.json({ ok: false, error: "invalid_payload", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const result = await processDaptaWebhook(getDb().db, parsed.data, getEnv());
  if (!result.ok) {
    console.warn("[dapta-webhook] lead not found for payload shape", payloadShape(body));
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, duplicate: result.duplicate, lead_id: result.leadId, qualified: result.qualified, cost_usd: result.costUsd });
}
