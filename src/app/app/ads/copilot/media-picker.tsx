"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, X } from "lucide-react";

/** F32 · what a variant shows; `state` blocks campaign creation until the media is usable. */
export interface Media {
  kind: "image" | "video";
  imageHash?: string;
  videoId?: string;
  preview: string | null;
  name: string;
  state: "uploading" | "processing" | "ready" | "error";
  progress: number;
  error?: string;
}

const MAX_IMAGE = 4 * 1024 * 1024;
const CHUNK = 3_500_000;
const MAX_VIDEO = 1024 * 1024 * 1024;

async function json(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.message ?? "No se pudo subir el archivo.");
  return data;
}

/** JPG/PNG ≤ 4 MB go as-is; anything else (HEIC/WebP or heavier) is re-encoded to JPEG, max 2048 px. */
async function toUploadableImage(file: File): Promise<Blob> {
  if (/^image\/(jpeg|png)$/.test(file.type) && file.size <= MAX_IMAGE) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  for (const q of [0.9, 0.8, 0.7, 0.6]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= MAX_IMAGE) return blob;
  }
  throw new Error("No se pudo reducir la imagen a 4 MB.");
}

export function MediaPicker({ id, media, onChange, hidePreview = false }: { id: string; media: Media | null; onChange: (m: Media | null) => void; hidePreview?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function uploadImage(file: File) {
    const preview = URL.createObjectURL(file);
    const base: Media = { kind: "image", preview, name: file.name, state: "uploading", progress: 0 };
    onChange(base);
    const blob = await toUploadableImage(file);
    const form = new FormData();
    form.set("file", blob, blob === file ? file.name : file.name.replace(/\.[^.]*$/, "") + ".jpg");
    const data = await json(await fetch("/api/ads/meta/media/image", { method: "POST", body: form }));
    onChange({ ...base, imageHash: data.image.hash, state: "ready", progress: 1 });
  }

  async function uploadVideo(file: File) {
    if (file.size > MAX_VIDEO) throw new Error("El video supera 1 GB.");
    const preview = URL.createObjectURL(file);
    let m: Media = { kind: "video", preview, name: file.name, state: "uploading", progress: 0 };
    onChange(m);
    const name = /\.(mp4|mov)$/i.test(file.name) ? file.name : `${file.name.replace(/\.[^.]*$/, "")}.mp4`;
    const start = await json(await fetch("/api/ads/meta/media/video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileSize: file.size, name }) }));
    const { videoId, sessionId } = start.upload as { videoId: string; sessionId: string };
    let next = { startOffset: start.upload.startOffset as number, endOffset: start.upload.endOffset as number };
    while (next.startOffset < file.size) {
      // Meta accepts a chunk shorter than it asked for and answers with the next offsets.
      const end = Math.min(next.endOffset > next.startOffset ? next.endOffset : file.size, next.startOffset + CHUNK, file.size);
      const res = await fetch(`/api/ads/meta/media/video?session=${sessionId}&offset=${next.startOffset}`, { method: "PUT", body: file.slice(next.startOffset, end) });
      next = (await json(res)).next;
      m = { ...m, progress: Math.min(1, next.startOffset / file.size) };
      onChange(m);
    }
    await json(await fetch("/api/ads/meta/media/video/finish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: sessionId, name }) }));
    m = { ...m, videoId, state: "processing", progress: 1 };
    onChange(m);
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const v = (await json(await fetch(`/api/ads/meta/media/video/${videoId}`))).video as { status: string };
      if (v.status === "ready") return onChange({ ...m, state: "ready" });
      if (v.status === "error") throw new Error("Meta no pudo procesar el video. Prueba con otro archivo (MP4, H.264).");
    }
    throw new Error("Meta sigue procesando el video. Vuelve a intentarlo en unos minutos.");
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.type.startsWith("video/") || /\.(mp4|mov)$/i.test(file.name)) await uploadVideo(file);
      else if (file.type.startsWith("image/")) await uploadImage(file);
      else throw new Error("Sube una imagen (JPG, PNG) o un video (MP4, MOV).");
    } catch (e) {
      onChange({ kind: "image", preview: null, name: file.name, state: "error", progress: 0, error: e instanceof Error ? e.message : "No se pudo subir el archivo." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const status =
    media?.state === "uploading"
      ? `Subiendo a Meta… ${Math.round(media.progress * 100)} %`
      : media?.state === "processing"
        ? "Meta está procesando el video…"
        : media?.state === "ready"
          ? media.kind === "video" ? "Video listo en Meta" : "Imagen lista en Meta"
          : media?.error;

  return (
    <div className="flex flex-col gap-2">
      <input ref={input} id={id} type="file" accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      {media && media.state !== "error" ? (
        <div className="flex items-center gap-3 rounded-button border border-border bg-faro-surface-2 p-2">
          {media.preview &&
            !hidePreview &&
            (media.kind === "video" ? (
              <video src={media.preview} className="size-14 shrink-0 rounded object-cover" muted playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media.preview} alt="" className="size-14 shrink-0 rounded object-cover" />
            ))}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs">{media.name}</p>
            <p className={`flex items-center gap-1 text-xs ${media.state === "ready" ? "text-faro-accent" : "text-faro-text-2"}`} role="status">
              {media.state !== "ready" && <Loader2 className="size-3 animate-spin" />} {status}
            </p>
            {media.state === "uploading" && (
              <div className="mt-1 h-1 rounded bg-border">
                <div className="h-1 rounded bg-faro-accent transition-all" style={{ width: `${Math.round(media.progress * 100)}%` }} />
              </div>
            )}
          </div>
          <button type="button" disabled={busy} onClick={() => onChange(null)} className="p-1 text-faro-text-3 hover:text-foreground disabled:opacity-40" aria-label="Quitar archivo">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-button border border-dashed border-border bg-faro-surface-2 px-3 text-sm text-faro-text-2 hover:border-faro-accent hover:text-foreground disabled:opacity-50"
        >
          <ImageUp className="size-4" /> Subir imagen o video
        </button>
      )}
      {media?.state === "error" && <p className="text-xs text-[var(--faro-danger)]" role="alert">{media.error}</p>}
    </div>
  );
}
