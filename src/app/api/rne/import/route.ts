import { NextResponse } from "next/server";
import { importRneResult } from "@/features/compliance/rne";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

/** F55 · POST multipart (file) or text/csv: the result file of the CRC bulk check. Stores each value as checked now. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  let text = "";
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Falta el archivo." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "El archivo pesa más de 5 MB." }, { status: 413 });
    text = await file.text();
  } else {
    text = await req.text();
    if (text.length > MAX_BYTES) return NextResponse.json({ ok: false, error: "El archivo pesa más de 5 MB." }, { status: 413 });
  }
  return withDb(async (db) => {
    const r = await importRneResult(db, text);
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  });
}
