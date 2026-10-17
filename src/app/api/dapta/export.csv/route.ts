import { getDb } from "@/db/client";
import { getDaptaAdapter } from "@/integrations/dapta";
import { selectLeadsForDapta } from "@/integrations/dapta/leads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** csv_export mode: CSV for Dapta sequences (<= 5 MB, formula-safe, suppressed leads excluded). */
export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const env = getEnv();
  const huntId = new URL(req.url).searchParams.get("hunt_id") ?? undefined;
  const records = await selectLeadsForDapta(getDb().db, { huntId, appUrl: env.NEXT_PUBLIC_APP_URL });
  const out = getDaptaAdapter(env).exportCsv(records);
  return new Response(out.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="faro-dapta-leads.csv"',
      "X-Rows": String(out.rows),
      "X-Truncated": String(out.truncated),
      "Cache-Control": "no-store",
    },
  });
}
