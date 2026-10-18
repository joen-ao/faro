import { NextResponse } from "next/server";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { CatalogSetting } from "@/features/offer/schema";
import { getServiceCatalog, saveServiceCatalog } from "@/features/settings/services";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

/** The team's services ("Mis servicios"): the saved catalog or the initial one (origin "default"). */
export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  return withDb(async (db) => NextResponse.json({ ok: true, ...(await getServiceCatalog(db)) }));
}

/** Saves the catalog (1 to 8 services, cleaned and cut to the limits). */
export async function PUT(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: 400 });
  const body = CatalogSetting.safeParse(raw.json);
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "invalid", issues: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  }
  return withDb(async (db) => {
    const saved = await saveServiceCatalog(db, body.data);
    return NextResponse.json({ ok: true, ...saved, origin: "panel" });
  });
}
