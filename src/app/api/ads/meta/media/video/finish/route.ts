import { NextResponse } from "next/server";
import { bad, mediaAdapter, VideoFinishBody } from "@/features/ads/media";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** F32 · Closes a chunked video upload; Meta then processes the video (poll GET …/video/{id}). */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  if (!raw.ok) return bad("JSON inválido");
  const body = VideoFinishBody.safeParse(raw.json);
  if (!body.success) return bad("Datos inválidos");
  return withDb(async (db) => {
    try {
      await mediaAdapter(db).finishVideoUpload(body.data.session, body.data.name);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
