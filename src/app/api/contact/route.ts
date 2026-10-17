import { NextResponse } from "next/server";
import { ICP_PAGES } from "@/config/icp-pages";
import { parseContact } from "@/features/diagnostic/contact";
import { recordContact } from "@/features/diagnostic/data";
import { parseTracking } from "@/features/diagnostic/params";

export const dynamic = "force-dynamic";

/** Company contact form -> `form_submit`. Honeypot hits answer 200 and store nothing. */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const parsed = parseContact(json);
  if (parsed.kind === "bot") return NextResponse.json({ ok: true });
  if (parsed.kind === "invalid") return NextResponse.json({ ok: false, errors: parsed.errors }, { status: 422 });
  const d = parsed.data;
  const tracking = parseTracking({ ...(d.utm ?? {}), c: d.c, s: d.s });
  const icpSlug = d.slug.startsWith("icp:") ? d.slug.slice(4) : undefined;
  if (icpSlug && !ICP_PAGES[icpSlug]) return NextResponse.json({ ok: false, error: "unknown_page" }, { status: 404 });
  const stored = await recordContact(d, tracking, icpSlug);
  if (!stored) return NextResponse.json({ ok: false, error: "unknown_page" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
