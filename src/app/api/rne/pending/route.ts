import { NextResponse } from "next/server";
import { rneExportCsv, rnePending } from "@/features/compliance/rne";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

/** F55 · GET: counts. GET ?format=csv: the file to upload to the CRC "Consulta masiva RNE" (max 10.000 values). */
export async function GET(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const csv = new URL(req.url).searchParams.get("format") === "csv";
  return withDb(async (db) => {
    const p = await rnePending(db);
    if (!csv) return NextResponse.json({ ok: true, pending: p.pending, clear: p.clear, excluded: p.excluded });
    const body = rneExportCsv(p.values);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="faro-rne-${day}.csv"`,
        "x-rows": String(Math.min(p.values.length, 10_000)),
      },
    });
  });
}
