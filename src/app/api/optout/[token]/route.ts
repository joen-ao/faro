import { NextResponse } from "next/server";
import { handleOptOut } from "@/features/compliance/handle";

export const dynamic = "force-dynamic";

/** GET never writes (mail scanners prefetch links): it sends people to the confirmation page. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return NextResponse.redirect(new URL(`/baja/${encodeURIComponent(token)}`, req.url), 303);
}

/** POST applies the opt-out. RFC 8058 one-click clients get JSON; the /baja form sends `redirect=1`. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const result = await handleOptOut(token);
  let redirect = false;
  try {
    redirect = (await req.formData()).get("redirect") === "1";
  } catch {
    /* non-form body */
  }
  if (redirect) return NextResponse.redirect(new URL(`/baja/${encodeURIComponent(token)}${result.ok ? "?done=1" : ""}`, req.url), 303);
  if (!result.ok) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  return NextResponse.json({ ok: true, suppressed: result.suppressed });
}
