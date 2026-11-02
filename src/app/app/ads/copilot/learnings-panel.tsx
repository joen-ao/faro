"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LearningView {
  id: string;
  dimension: string;
  metric: string;
  winner: string;
  statement: string;
  confidence: string;
  source: string;
  periodStart: string;
  periodEnd: string;
}

const CONF_STYLE: Record<string, string> = {
  alta: "border-[var(--faro-border-active)] text-faro-accent",
  media: "border-[var(--faro-border-active)] text-faro-accent",
  baja: "border-border text-faro-text-2",
  insuficiente: "border-border text-faro-text-3",
};

export function LearningsPanel({ learnings }: { learnings: LearningView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/ads/copilot/learnings", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? `${data.result?.stored ?? 0} aprendizajes (${data.result?.periodStart} a ${data.result?.periodEnd}).` : "No se pudo generar.");
      if (res.ok) router.refresh();
    } catch {
      setMsg("No hay conexión con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="learn-h" className="rounded-card border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="learn-h" className="flex items-center gap-2 text-lg font-semibold"><Lightbulb className="size-4 text-faro-accent" /> Aprendizajes</h2>
          <p className="mt-1 max-w-2xl text-sm text-faro-text-2">
            Cada lunes Faro compara ángulos y formatos de los últimos 28 días con estadística. Claude solo redacta; si cita un número que no está en los datos, se usa un texto fijo.
            Los de confianza media o alta guían las próximas propuestas.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={busy} onClick={run} className="shrink-0">{busy ? "Calculando…" : "Generar ahora"}</Button>
      </div>
      {learnings.length === 0 ? (
        <p className="mt-4 rounded-button border border-dashed border-border p-4 text-sm text-faro-text-2">
          Aún no hay aprendizajes. Hacen falta al menos 2 ángulos o formatos con datos; con poco gasto, las primeras semanas dirán &quot;datos insuficientes&quot;, y eso es honesto.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {learnings.map((l) => (
            <li key={l.id} className="rounded-button border border-border bg-faro-surface-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${CONF_STYLE[l.confidence] ?? CONF_STYLE.baja}`}>Confianza {l.confidence}</span>
                <span className="text-xs text-faro-text-3">
                  {l.dimension === "angle" ? "Ángulo" : "Formato"} · {l.metric === "ctr" ? "CTR" : "calificación"} · {l.periodStart} a {l.periodEnd}{l.source === "template" ? " · texto fijo" : ""}
                </span>
              </div>
              <p className="mt-2 break-words text-sm">{l.statement}</p>
            </li>
          ))}
        </ul>
      )}
      {msg && <p role="status" className="mt-3 text-xs text-faro-text-2">{msg}</p>}
    </section>
  );
}
