import { NextResponse } from "next/server";
import { bad, chunkQuery, MAX_CHUNK_BYTES, mediaAdapter, VideoStartBody } from "@/features/ads/media";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** F32 · Starts a chunked video upload to the ad account library. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  if (!raw.ok) return bad("JSON inválido");
  const body = VideoStartBody.safeParse(raw.json);
  if (!body.success) return bad(body.error.issues[0]?.message ?? "Datos inválidos");
  return withDb(async (db) => {
    try {
      const ads = mediaAdapter(db);
      return NextResponse.json({ ok: true, mock: ads.isMock, upload: await ads.startVideoUpload(body.data.fileSize) });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}

/** F32 · Relays one chunk (≤ 4 MB raw body) at `offset`; returns the offsets Meta expects next. */
export async function PUT(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const q = chunkQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return bad("Sesión u offset inválidos");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_CHUNK_BYTES) return bad("Trozo demasiado grande", 413);
  const chunk = new Uint8Array(await req.arrayBuffer());
  if (!chunk.length) return bad("Trozo vacío");
  if (chunk.length > MAX_CHUNK_BYTES) return bad("Trozo demasiado grande", 413);
  return withDb(async (db) => {
    try {
      return NextResponse.json({ ok: true, next: await mediaAdapter(db).transferVideoChunk(q.data.session, q.data.offset, chunk) });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
