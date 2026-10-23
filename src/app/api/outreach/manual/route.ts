import { handleManual } from "@/features/outreach/api";
import { runOutreachRoute } from "@/features/outreach/route";

export const dynamic = "force-dynamic";

/** POST /api/outreach/manual: a person contacted an independent by hand (own mail or WhatsApp); records it. */
export function POST(req: Request) {
  return runOutreachRoute(req, handleManual);
}
