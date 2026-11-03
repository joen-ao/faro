import { NextResponse } from "next/server";
import { z } from "zod";
import { getCellLeads } from "@/features/dashboard/data";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

const query = z.object({
  source: z.enum(["osm", "rues", "reps", "secop", "rnt", "solidaria", "google_places", "website", "meta_ads", "sample"]),
  contact: z.enum(["email", "web_form", "whatsapp", "dapta_widget"]).optional(),
});

/** Leads + receipts behind a heatmap cell (real data only). */
export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  const { source, contact } = parsed.data;
  return withDb(async (db) => NextResponse.json(await getCellLeads(db, { source, contact: contact ?? null })));
}
