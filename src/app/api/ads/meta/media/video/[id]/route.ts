import { NextResponse } from "next/server";
import { bad, mediaAdapter } from "@/features/ads/media";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

/** F32 · Processing state of an uploaded video (processing → ready) and its Meta thumbnail for the preview. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const { id } = await params;
  if (!/^\d{5,25}$/.test(id)) return bad("ID de video inválido");
  return withDb(async (db) => {
    try {
      return NextResponse.json({ ok: true, video: await mediaAdapter(db).getVideo(id) });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
