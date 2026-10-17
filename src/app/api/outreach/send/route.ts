import { handleSend } from "@/features/outreach/api";
import { runOutreachRoute } from "@/features/outreach/route";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runOutreachRoute(req, handleSend);
}
