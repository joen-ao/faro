import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
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
  const parsed = daptaWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const result = await processDaptaWebhook(getDb().db, parsed.data, getEnv());
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, duplicate: result.duplicate, lead_id: result.leadId, qualified: result.qualified, cost_usd: result.costUsd });
}
