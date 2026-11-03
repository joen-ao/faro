import { after, NextResponse } from "next/server";
import { getReadyDb } from "@/db/client";
import { clientIp, createLimiter, readJsonCapped } from "@/features/diagnostic/limits";
import { parsePublicLead, PUBLIC_LEAD_ORIGINS, recordPublicLead } from "@/features/inbound/public-lead";
import { eventIdOr, trackLead } from "@/features/tracking/meta";

export const dynamic = "force-dynamic";

/** 5 submissions per 10 minutes per IP. */
const limiter = createLimiter(5, 10 * 60 * 1000);

const allowed = (origin: string | null): origin is string => !!origin && (PUBLIC_LEAD_ORIGINS as readonly string[]).includes(origin);

function cors(origin: string) {
  return { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "Origin" };
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  if (!allowed(origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: cors(origin) });
}

/**
 * F31 · mokub.co form -> Faro lead + Conversions API `Lead` (only with `adConsent: true`).
 * Only mokub.co origins; honeypot hits answer 200 and store nothing.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!allowed(origin)) return NextResponse.json({ ok: false, error: "forbidden_origin" }, { status: 403 });
  const headers = cors(origin);
  if (!limiter.allow(clientIp(req))) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers });
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: raw.error === "too_large" ? 413 : 400, headers });
  const parsed = parsePublicLead(raw.json);
  if (parsed.kind === "bot") return NextResponse.json({ ok: true }, { headers });
  if (parsed.kind === "invalid") return NextResponse.json({ ok: false, errors: parsed.errors }, { status: 422, headers });

  const extra = raw.json as { eventId?: unknown; fbc?: unknown; fbp?: unknown; fbclid?: unknown; url?: unknown; adConsent?: unknown };
  // The visitor's choice in mokub.co's cookie notice: without an explicit `true`, nothing is shared with Meta.
  const adConsent = extra.adConsent === true;
  const db = await getReadyDb();
  const leadId = await recordPublicLead(db, parsed.data, parsed.tracking, { adConsent });
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const eventId = eventIdOr(extra.eventId);
  if (adConsent) {
    after(() =>
      trackLead(db, {
        leadId,
        eventId,
        emails: [parsed.data.email],
        phones: [parsed.data.phone],
        fbc: str(extra.fbc),
        fbp: str(extra.fbp),
        fbclid: str(extra.fbclid),
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
        sourceUrl: str(extra.url) ?? req.headers.get("referer") ?? undefined,
      }),
    );
  }
  return NextResponse.json({ ok: true, eventId }, { headers });
}
