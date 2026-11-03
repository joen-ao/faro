import { NextResponse } from "next/server";
import { z } from "zod";
import type { AppDb } from "@/db/types";
import { getMetaAds, type MetaAdsAdapter } from "@/integrations/meta-ads";
import { getEnv } from "@/lib/env";
import { apiCallLogger } from "./meta";

/** F32 · limits for creatives uploaded from Faro. Vercel caps a request body at 4.5 MB, hence the chunked video upload. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
/** What the browser sends per request (under MAX_CHUNK_BYTES with headroom). */
export const CLIENT_CHUNK_BYTES = 3_500_000;

export type ImageKind = "jpg" | "png";

/** Detects JPEG/PNG by magic bytes (the declared MIME type is not trusted). */
export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  return null;
}

/** A short, safe file name for Meta's library (no paths, no odd characters). */
export function safeName(name: string, ext: string): string {
  const base = name.replace(/\.[^.]*$/, "").normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "faro";
  return `${base}.${ext}`;
}

export const VideoStartBody = z.object({
  fileSize: z.number().int().min(1).max(MAX_VIDEO_BYTES, "El video supera 1 GB"),
  name: z.string().trim().min(1).max(200).regex(/\.(mp4|mov)$/i, "Solo MP4 o MOV"),
});

export const VideoFinishBody = z.object({
  session: z.string().regex(/^\d{5,25}$/),
  name: z.string().trim().min(1).max(200),
});

export const chunkQuery = z.object({
  session: z.string().regex(/^\d{5,25}$/),
  offset: z.coerce.number().int().min(0).max(MAX_VIDEO_BYTES),
});

export function mediaAdapter(db: AppDb): MetaAdsAdapter {
  return getMetaAds(getEnv(), apiCallLogger(db));
}

export const bad = (message: string, status = 400) => NextResponse.json({ ok: false, error: "invalid", message }, { status });
