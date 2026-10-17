import { NextResponse } from "next/server";
import { MAX_CSV_BYTES, parseSpendCsv, saveAdSpend } from "@/features/ads";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

const tooLarge = () => NextResponse.json({ ok: false, error: "too_large", message: "El archivo supera 1 MB." }, { status: 413 });

/**
 * CSV spend upload (max 1 MB). Body: raw `text/csv`, or multipart with a `file` field (and optional `demo=1`).
 * `?demo=1` marks the rows as test data. Valid rows are saved; invalid ones are returned per line.
 */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  // Allow multipart framing overhead on top of the 1 MB file cap; exact size is re-checked below.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_CSV_BYTES + 4096) return tooLarge();

  let text: string;
  let demo = new URL(req.url).searchParams.get("demo") === "1";
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
    if (file.size > MAX_CSV_BYTES) return tooLarge();
    text = await file.text();
    demo = demo || form.get("demo") === "1";
  } else {
    text = await req.text();
  }
  if (Buffer.byteLength(text) > MAX_CSV_BYTES) return tooLarge();

  const { rows, errors } = parseSpendCsv(text);
  return withDb(async (db) => {
    const saved = await saveAdSpend(db, rows, { isDemo: demo });
    return NextResponse.json({ ok: errors.length === 0, ...saved, errors }, { status: rows.length === 0 && errors.length ? 400 : 200 });
  });
}
