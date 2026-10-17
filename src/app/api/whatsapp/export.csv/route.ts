import { z } from "zod";
import { getDb } from "@/db/client";
import { getWhatsappAdapter, selectWhatsappRows } from "@/integrations/whatsapp";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** WhatsApp sequence CSV for Dapta. 404 unless WHATSAPP_ENABLED=true. Nothing is sent from Faro. */
export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const env = getEnv();
  if (!env.WHATSAPP_ENABLED) {
    return Response.json({ ok: false, error: "whatsapp_disabled", message: "WhatsApp está desactivado (WHATSAPP_ENABLED=false)." }, { status: 404 });
  }
  const huntId = new URL(req.url).searchParams.get("hunt_id") ?? undefined;
  if (huntId !== undefined && !z.string().uuid().safeParse(huntId).success) {
    return Response.json({ ok: false, error: "invalid_hunt_id" }, { status: 400 });
  }
  const sel = await selectWhatsappRows(getDb().db, { appUrl: env.NEXT_PUBLIC_APP_URL, huntId, reserve: true });
  const out = getWhatsappAdapter(env).exportCsv(sel.rows);
  return new Response(out.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="faro-whatsapp-secuencia.csv"',
      "X-Rows": String(out.rows),
      "X-Skipped": String(sel.skipped.length),
      "X-Next-Allowed-At": sel.nextAllowedAt?.toISOString() ?? "",
      "Cache-Control": "no-store",
    },
  });
}
