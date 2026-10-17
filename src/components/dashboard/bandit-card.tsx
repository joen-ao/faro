"use client";

import { useState } from "react";
import { fmtPct, fmtUsd, sourceLabel } from "@/features/dashboard/format";
import type { NextBudget, SimulationResult } from "@/features/bandit";
import { cn } from "@/lib/utils";

function Bar({ label, pct, right, sim }: { label: string; pct: number; right: string; sim?: boolean }) {
  return (
    <li className="text-sm sm:grid sm:grid-cols-[9rem_1fr_auto] sm:items-center sm:gap-3">
      <div className="flex items-baseline justify-between gap-3 sm:contents">
        <span className="truncate text-faro-text-2">{label}</span>
        <span className="tabular-nums text-white sm:order-3">{right}</span>
      </div>
      <span className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-faro-surface-3 sm:mt-0" aria-hidden>
        <span className={cn("block h-full rounded-full", sim ? "bg-faro-accent/60" : "bg-faro-accent")} style={{ width: `${Math.max(2, pct * 100)}%` }} />
      </span>
    </li>
  );
}

/** "Dónde invertir el próximo dólar": real Thompson split, or a clearly labelled SIMULACIÓN. Never mixed. */
export function BanditCard({ real, simulation }: { real: NextBudget; simulation: SimulationResult }) {
  const [sim, setSim] = useState(false);
  const avg = (src: string) => simulation.rounds.reduce((a, r) => a + (r.shares[src] ?? 0), 0) / simulation.rounds.length;
  return (
    <section
      aria-label="Dónde invertir el próximo dólar"
      className={cn("rounded-card border bg-card p-5 sm:p-6", sim ? "border-2 border-dashed border-destructive/60" : "border-border")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">Dónde invertir el próximo dólar</h3>
          <p className="mt-1 text-sm text-faro-text-2">Muestreo de Thompson sobre calificados por dólar, solo con datos reales.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={sim}
          onClick={() => setSim((v) => !v)}
          className="inline-flex min-h-11 items-center gap-2 rounded-button border border-border px-3.5 text-sm text-faro-text-2 transition-colors hover:text-white aria-checked:border-faro-accent aria-checked:text-white"
        >
          Ver simulación
        </button>
      </div>

      <div className="mt-5">
        {sim ? (
          <div data-testid="bandit-sim">
            <p className="mb-3 flex flex-wrap items-center gap-3">
              <span className="rounded border-2 border-destructive px-2 py-0.5 text-xs font-bold tracking-[0.3em] text-destructive">{simulation.label}</span>
              <span className="text-sm text-faro-text-2">{simulation.note}</span>
            </p>
            <ul className="space-y-2.5">
              {simulation.assumed.map((a) => (
                <Bar key={a.source} sim label={sourceLabel(a.source)} pct={avg(a.source)} right={`${fmtPct(avg(a.source))} · tasa supuesta ${fmtPct(a.rate)}`} />
              ))}
            </ul>
            <p className="mt-3 text-xs text-faro-text-3">Reparto promedio de {simulation.rounds.length} rondas: el sistema empieza explorando y converge hacia la fuente con más calificados por dólar.</p>
          </div>
        ) : real.status === "insufficient" ? (
          <div data-testid="bandit-real">
            <p className="font-display text-xl font-semibold text-faro-text-2">Datos insuficientes</p>
            <p className="mt-1 text-sm text-faro-text-2">{real.reason} No se sugiere ningún reparto.</p>
          </div>
        ) : (
          <div data-testid="bandit-real">
            <p className="mb-3 text-sm text-faro-text-2">Reparto sugerido de {fmtUsd(real.budgetUsd)}:</p>
            <ul className="space-y-2.5">
              {real.allocations.map((a) => (
                <Bar key={a.source} label={sourceLabel(a.source)} pct={a.probabilityBest} right={`${fmtUsd(a.budgetUsd)} · ${fmtPct(a.probabilityBest)} mejor`} />
              ))}
            </ul>
            <p className="mt-3 text-xs text-faro-text-3">% mejor = probabilidad de que la fuente sea la más rentable ({real.samples.toLocaleString("en-US")} muestras).</p>
          </div>
        )}
      </div>
    </section>
  );
}
