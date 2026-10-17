import { NextResponse } from "next/server";
import { handleOptOut } from "@/features/compliance/handle";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const result = await handleOptOut(token);
  if (!result.ok) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  return NextResponse.json({ ok: true, suppressed: result.suppressed });
}

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post). */
export const POST = GET;
