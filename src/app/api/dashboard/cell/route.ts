import { NextResponse } from "next/server";
import { z } from "zod";
import { getCellLeads } from "@/features/dashboard/data";
import { getDemoDb } from "@/features/dashboard/demo-db";
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
    const target = demo === "1" ? await getDemoDb() : db;
    return NextResponse.json(await getCellLeads(target, { source, contact: contact ?? null, demo: demo === "1" }));
  });
}
