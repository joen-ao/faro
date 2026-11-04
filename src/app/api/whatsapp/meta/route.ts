import { after, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { applyStatus, getAgentDeps, recordInbound, replyTo } from "@/features/wa-agent";
import { parseMetaWebhook, verifyChallenge, verifyMetaSignature } from "@/integrations/wa-cloud/webhook";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** F44 · Meta's webhook URL check: echoes `hub.challenge` when the verify token matches. */
export function GET(req: Request) {
  const challenge = verifyChallenge(new URL(req.url).searchParams, getEnv().WA_VERIFY_TOKEN);
  if (challenge === null) return new NextResponse("forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

/**
 * F44 · Cloud API deliveries. The signature is checked on the raw body; messages are stored (idempotent by wamid)
 * before answering 200, and the agent replies after the response with `after()`, so Meta never waits on the model.
 */
export async function POST(req: Request) {
  const env = getEnv();
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), env.WA_APP_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const { messages, statuses } = parseMetaWebhook(body);
  // Only the configured business number is answered (a shared app can receive others).
  const mine = messages.filter((m) => !env.WA_PHONE_NUMBER_ID || m.phoneNumberId === env.WA_PHONE_NUMBER_ID);
  const { db } = getDb();
  const deps = getAgentDeps(env);
  for (const s of statuses) await applyStatus(db, s.wamid, s.status);
  for (const m of mine) {
    const r = await recordInbound(db, deps, m);
    if (r.reply && r.conversationId && r.messageId) {
      const { conversationId, messageId } = r;
      after(() =>
        replyTo(db, deps, conversationId, messageId).catch((e: unknown) => console.error("[wa-agent] reply failed", e instanceof Error ? e.message : e)),
      );
    }
  }
  return NextResponse.json({ ok: true, messages: mine.length, statuses: statuses.length });
}
