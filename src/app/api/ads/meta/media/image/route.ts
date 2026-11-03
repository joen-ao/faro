import { NextResponse } from "next/server";
import { bad, MAX_IMAGE_BYTES, mediaAdapter, safeName, sniffImage } from "@/features/ads/media";
import { metaErrorResponse } from "@/features/ads/meta-http";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** F32 · Uploads one JPG/PNG (≤ 4 MB) to the ad account's image library and returns its hash. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64 * 1024) return bad("La imagen supera 4 MB", 413);
  let file: File | null = null;
  try {
    const f = (await req.formData()).get("file");
    file = f instanceof File ? f : null;
  } catch {
    return bad("Envía la imagen como archivo");
  }
  if (!file) return bad("Falta la imagen");
  if (file.size > MAX_IMAGE_BYTES) return bad("La imagen supera 4 MB", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return bad("Solo JPG o PNG");
  return withDb(async (db) => {
    try {
      const ads = mediaAdapter(db);
      const img = await ads.uploadImage(bytes, safeName(file.name, kind));
      return NextResponse.json({ ok: true, mock: ads.isMock, image: img });
    } catch (e) {
      return metaErrorResponse(e);
    }
  });
}
