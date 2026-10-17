import { NextResponse } from "next/server";
import { z } from "zod";
import { eventsForSlug, getDiagnostic, recordOpen } from "@/features/diagnostic/data";
import { parseTracking } from "@/features/diagnostic/params";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ slug: z.string().min(1).max(120) }).passthrough();

/** Records a page open (`widget_open`) with validated c / s / utm_*. Invalid tracking values are dropped, not rejected. */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const utm = (body.data as { utm?: Record<string, string> }).utm ?? {};
  const tracking = parseTracking({ ...utm, c: (body.data as { c?: string }).c, s: (body.data as { s?: string }).s });
  const recorded = await recordOpen(body.data.slug, tracking);
  return NextResponse.json({ ok: true, recorded, tracking });
}

/** Test/e2e only (FARO_SEED_DEMO=1): events of a demo lead. Disabled otherwise. */
export async function GET(req: Request) {
  if (process.env.FARO_SEED_DEMO !== "1") return NextResponse.json({ ok: false }, { status: 404 });
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const d = await getDiagnostic(slug);
  if (!d?.isDemo) return NextResponse.json({ ok: false }, { status: 404 });
  const rows = await eventsForSlug(slug);
  return NextResponse.json({ ok: true, events: rows.map((e) => ({ type: e.type, utm: e.utm, payload: e.payload })) });
}
