import { NextResponse } from "next/server";
import { ICP_PAGES } from "@/config/icp-pages";
import { parseContact } from "@/features/diagnostic/contact";
import { recordContact } from "@/features/diagnostic/data";
import { clientIp, createLimiter, demoToolsEnabled, readJsonCapped } from "@/features/diagnostic/limits";
import { parseTracking } from "@/features/diagnostic/params";

export const dynamic = "force-dynamic";

/** 5 submissions per 10 minutes per IP + page. */
const limiter = createLimiter(demoToolsEnabled() ? 100 : 5, 10 * 60 * 1000);

/** Company contact form -> `form_submit`. Body capped at 16 KB; honeypot hits answer 200 and store nothing. */
export async function POST(req: Request) {
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: raw.error === "too_large" ? 413 : 400 });
  const slugForLimit = typeof (raw.json as { slug?: unknown })?.slug === "string" ? String((raw.json as { slug: string }).slug).slice(0, 120) : "";
  if (!limiter.allow(`${clientIp(req)}|${slugForLimit}`)) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const parsed = parseContact(raw.json);
  if (parsed.kind === "bot") return NextResponse.json({ ok: true });
  if (parsed.kind === "invalid") return NextResponse.json({ ok: false, errors: parsed.errors }, { status: 422 });
  const d = parsed.data;
  const tracking = parseTracking({ ...(d.utm ?? {}), c: d.c, s: d.s });
  const icpSlug = d.slug.startsWith("icp:") ? d.slug.slice(4) : undefined;
  if (icpSlug && !Object.hasOwn(ICP_PAGES, icpSlug)) return NextResponse.json({ ok: false, error: "unknown_page" }, { status: 404 });
  const stored = await recordContact(d, tracking, icpSlug);
  if (!stored) return NextResponse.json({ ok: false, error: "unknown_page" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
