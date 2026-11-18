"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const n = (v: number) => v.toLocaleString("es-CO");

/** F55 · RNE (Ley 2300): download pending contacts for the CRC bulk check, upload the CRC result. */
export function RneSection(props: { pending: number; clear: number; excluded: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("file", file);
    const r = await fetch("/api/rne/import", { method: "POST", body: fd });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; checked?: number; excluded?: number; headers?: string[] };
    setBusy(false);
    setMsg(
      j.ok
        ? { ok: true, text: `Listo: ${n(j.checked ?? 0)} datos verificados, ${n(j.excluded ?? 0)} inscritos en el RNE (no se les escribirá).` }
        : { ok: false, text: `${j.error ?? "No se pudo leer el archivo."}${j.headers?.length ? ` Columnas leídas: ${j.headers.join(", ")}.` : ""}` },
    );
    router.refresh();
  };

  return (
    <section className="mt-12 flex flex-col gap-5" data-testid="rne-section">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-faro-text-3">Ley 2300 · Registro de Números Excluidos</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">Independientes y celulares personales</h2>
        <p className="mt-1 text-sm text-faro-text-2">
          Antes de escribirle a una persona natural (correo o WhatsApp) hay que consultar el RNE de la CRC. Faro solo le escribe automáticamente a quien pasó la consulta en los últimos 30 días, y nunca a quien está inscrito.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-card border border-border bg-faro-surface-1 p-4">
          <p className="text-faro-text-3">Por consultar</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{n(props.pending)}</p>
        </div>
        <div className="rounded-card border border-border bg-faro-surface-1 p-4">
          <p className="text-faro-text-3">Libres (se les puede escribir)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-faro-accent">{n(props.clear)}</p>
        </div>
        <div className="rounded-card border border-border bg-faro-surface-1 p-4">
          <p className="text-faro-text-3">Inscritos en el RNE</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{n(props.excluded)}</p>
        </div>
      </div>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-faro-text-2">
        <li>Descarga el archivo de datos por consultar (hasta 10.000 por archivo).</li>
        <li>En tramitescrcom.gov.co entra con la cuenta de la empresa → RNE Ley 2300 → Consulta masiva, y súbelo.</li>
        <li>Descarga el resultado que te da la CRC y súbelo aquí.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <a href="/api/rne/pending?format=csv">Descargar datos por consultar</a>
        </Button>
        <label className="inline-flex cursor-pointer items-center">
          <input
            type="file"
            accept=".csv,.txt,text/csv"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <span className="inline-flex h-10 items-center rounded-button bg-faro-accent px-4 text-sm font-bold text-[var(--faro-accent-ink)]">{busy ? "Leyendo…" : "Subir resultado de la CRC"}</span>
        </label>
      </div>
      {msg && (
        <p role="status" className={msg.ok ? "text-sm text-white" : "text-sm text-[var(--faro-danger)]"}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
