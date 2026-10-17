import { NextResponse } from "next/server";
import { z } from "zod";
import { getCellLeads, resolveDemoDb } from "@/features/dashboard/data";
import { getChannelMetrics } from "@/features/metrics/channels";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

const query = z.object({
  source: z.enum(["osm", "rues", "reps", "google_places", "website", "meta_ads", "sample"]),
  contact: z.enum(["email", "web_form", "whatsapp", "dapta_widget"]).optional(),
  demo: z.enum(["0", "1"]).default("0"),
});

/** Leads + receipts behind a heatmap cell. `demo=1` reads the DEMO world (never mixed with real). */
export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  const { source, contact, demo } = parsed.data;
  return withDb(async (db) => {
    let target = db;
    if (demo === "1") {
      const persistent = (await getChannelMetrics(db, { includeDemo: true })).demo;
      target = await resolveDemoDb(db, persistent);
    }
    return NextResponse.json(await getCellLeads(target, { source, contact: contact ?? null, demo: demo === "1" }));
  });
}
