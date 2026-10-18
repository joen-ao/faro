"use client";

import { Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Batch {
  revisados: number;
  enriquecidos: number;
  conAgenda: number;
  conWhatsapp: number;
  contactosNuevos: number;
  costoApifyUsd: number;
  promovidosAFit: number;
  nextCursor: number;
  total: number;
  done: boolean;
}
type Totals = Pick<Batch, "revisados" | "enriquecidos" | "conAgenda" | "conWhatsapp" | "contactosNuevos" | "costoApifyUsd" | "promovidosAFit">;
const ZERO: Totals = { revisados: 0, enriquecidos: 0, conAgenda: 0, conWhatsapp: 0, contactosNuevos: 0, costoApifyUsd: 0, promovidosAFit: 0 };

/** Loops POST /api/hunts/[id]/enrich (nextCursor/done) so the whole hunt is enriched in <55 s batches. */
export function EnrichButton({ huntId, auto = false, onFinished }: { huntId: string; auto?: boolean; onFinished?: () => void }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ at: number; total: number } | null>(null);
  const [totals, setTotals] = useState<Totals>(ZERO);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const stop = useRef(false);
  const autoStarted = useRef(false);
  const [autoMode, setAutoMode] = useState(false);

  // Chosen at creation: starts once, as soon as every source finished (the server remembers when it is done).
  useEffect(() => {
    if (!auto || autoStarted.current) return;
    autoStarted.current = true;
    const t = setTimeout(() => {
      setAutoMode(true);
      void run();
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when auto turns on
  }, [auto]);

  async function run() {
    setRunning(true);
    setError(null);
    setFinished(false);
    setTotals(ZERO);
    stop.current = false;
    let cursor = 0;
    const acc: Totals = { ...ZERO };
    try {
      for (;;) {
        const res = await fetch(`/api/hunts/${huntId}/enrich?apify=1&cursor=${cursor}`, { method: "POST" });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Error ${res.status}`);
        const b = (await res.json()) as Batch;
        for (const k of Object.keys(acc) as Array<keyof Totals>) acc[k] += b[k];
        setTotals({ ...acc });
        setProgress({ at: Math.min(b.nextCursor, b.total), total: b.total });
        if (b.done || b.nextCursor <= cursor || stop.current) break;
        cursor = b.nextCursor;
      }
      setFinished(true);
      onFinished?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enriquecer");
    } finally {
      setRunning(false);
    }
  }

  const pct = progress && progress.total ? Math.round((progress.at / progress.total) * 100) : 0;
  return (
    <div data-testid="enrich">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-faro-accent/50 bg-faro-accent/[0.08] px-3 text-[14px] font-bold text-faro-accent transition-colors hover:border-faro-accent hover:bg-faro-accent/[0.14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-faro-accent disabled:cursor-wait disabled:opacity-70"
      >
        <Globe className="size-4" aria-hidden />
        {running ? `${autoMode ? "Enriqueciendo automáticamente" : "Enriqueciendo"}… ${progress ? `${progress.at} de ${progress.total}` : ""}` : finished ? "Volver a enriquecer sitios web (Apify)" : "Enriquecer sitios web (Apify)"}
      </button>
      {(running || finished) && progress && (
        <div className="mt-2" aria-live="polite">
          <div className="h-[3px] overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del enriquecimiento">
            <div className="h-full rounded-full bg-faro-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[11.5px] text-faro-text-2">
            {totals.enriquecidos} sitios leídos · {totals.conAgenda} con agenda · {totals.conWhatsapp} con WhatsApp · {totals.contactosNuevos} contactos nuevos · {totals.promovidosAFit} subieron a perfil · Apify ${totals.costoApifyUsd.toFixed(4)}
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-[var(--faro-danger)]">{error}</p>}
    </div>
  );
}
