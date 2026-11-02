import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { emailEventSchema, processEmailEvent } from "@/features/replies/service";
import { verifySvix } from "@/features/replies/signature";
import { createReplyForwarder } from "@/features/replies/forward";
import { getEmail } from "@/integrations/email";
import { fetchReceivedEmail } from "@/integrations/email/inbound";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Resend (Svix-signed) delivery events and inbound replies. See specs/F11-respuestas.md. */
export async function POST(req: Request) {
  const raw = await req.text();
  const v = verifySvix(raw, req.headers, process.env.RESEND_WEBHOOK_SECRET);
  if (!v.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (raw.length > 1_000_000) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = emailEventSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  const env = getEnv();
  const key = env.RESEND_INBOUND_API_KEY ?? env.RESEND_API_KEY;
  // F27: read the reply's content and forward it to the team (only when real sending is on).
  const forward =
    env.REPLY_FORWARD_TO && env.EMAIL_FROM && env.SEND_ENABLED === true
      ? createReplyForwarder({ email: getEmail(env), from: env.EMAIL_FROM, to: env.REPLY_FORWARD_TO, replyDomain: env.EMAIL_REPLY_DOMAIN, appUrl: env.NEXT_PUBLIC_APP_URL })
      : undefined;
  const out = await processEmailEvent(getDb().db, parsed.data, v.id, {
    replyDomain: env.EMAIL_REPLY_DOMAIN,
    ...(key ? { fetchReceived: (id: string) => fetchReceivedEmail(id, key) } : {}),
    ...(forward ? { forward } : {}),
  });
  return NextResponse.json({ ok: true, ...out });
}
