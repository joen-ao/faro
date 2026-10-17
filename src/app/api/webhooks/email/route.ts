import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { emailEventSchema, processEmailEvent } from "@/features/replies/service";
import { verifySvix } from "@/features/replies/signature";

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
  const out = await processEmailEvent(getDb().db, parsed.data, v.id);
  return NextResponse.json({ ok: true, ...out });
}
