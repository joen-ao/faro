import { NextResponse } from "next/server";
import { z } from "zod";
import { eventsForSlug, getDiagnostic, recordOpen } from "@/features/diagnostic/data";
import { clientIp, createLimiter, demoToolsEnabled, readJsonCapped } from "@/features/diagnostic/limits";
import { parseTracking } from "@/features/diagnostic/params";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const limiter = createLimiter(20, 10 * 60 * 1000);
const bodySchema = z.object({ slug: z.string().min(1).max(120), c: z.string().max(20).optional(), s: z.string().max(20).optional(), utm: z.record(z.string(), z.string().max(80)).optional() });

/**
 * Records a page open with validated c / s / utm_*: `widget_open` when the real Dapta widget is configured,
 * otherwise a `click` page_view. Deduped per lead+channel+source for 30 min; rate limited per IP.
 */
export async function POST(req: Request) {
  if (!limiter.allow(clientIp(req))) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: raw.error === "too_large" ? 413 : 400 });
  const body = bodySchema.safeParse(raw.json);
  if (!body.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const tracking = parseTracking({ ...(body.data.utm ?? {}), c: body.data.c, s: body.data.s });
  const recorded = await recordOpen(body.data.slug, tracking, !!getEnv().DAPTA_WIDGET_SNIPPET);
  return NextResponse.json({ ok: true, recorded });
}

/** Test/e2e only (FARO_SEED_DEMO=1, never in production unless FARO_E2E=1): events of a demo lead. */
export async function GET(req: Request) {
  if (!demoToolsEnabled()) return NextResponse.json({ ok: false }, { status: 404 });
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const d = await getDiagnostic(slug);
  if (!d?.isDemo) return NextResponse.json({ ok: false }, { status: 404 });
  const rows = await eventsForSlug(slug);
  return NextResponse.json({ ok: true, events: rows.map((e) => ({ type: e.type, utm: e.utm, payload: e.payload })) });
}
