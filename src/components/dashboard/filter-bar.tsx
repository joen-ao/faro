"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { filtersQuery, type ChannelFilter, type DashFilters, type Period, type SegmentFilter } from "@/features/dashboard/filters";
import { cn } from "@/lib/utils";

/* F43 · Global filters. Everything lives in the URL so a filtered view can be shared or bookmarked. */

const PERIOD_OPTS: { v: Period; label: string }[] = [
  { v: "hoy", label: "Hoy" },
  { v: "ayer", label: "Ayer" },
  { v: "7", label: "7 días" },
  { v: "30", label: "30 días" },
  { v: "90", label: "90 días" },
  { v: "custom", label: "Fechas" },
];
const CHANNEL_OPTS: { v: ChannelFilter; label: string }[] = [
  { v: "all", label: "Todos los canales" },
  { v: "email", label: "Correo" },
  { v: "whatsapp", label: "WhatsApp" },
  { v: "meta", label: "Meta (pauta)" },
];
const SEGMENT_OPTS: { v: SegmentFilter; label: string }[] = [
  { v: "all", label: "Empresas e independientes" },
  { v: "empresas", label: "Solo empresas" },
  { v: "independientes", label: "Solo independientes" },
];

const selectCls =
  "min-h-9 min-w-0 rounded-[8px] border border-border bg-faro-surface-1 px-2.5 text-sm text-white outline-none transition-colors hover:border-white/25 focus-visible:border-[var(--faro-border-active)] focus-visible:ring-2 focus-visible:ring-[var(--faro-accent)]/40";

export function FilterBar({ filters, hunts, summary }: { filters: DashFilters; hunts: { id: string; label: string }[]; summary: string }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [customOpen, setCustomOpen] = useState(filters.period === "custom");
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const go = (patch: Partial<DashFilters>) => start(() => router.push(`${path}${filtersQuery(filters, patch)}`, { scroll: false }));
  const active = filters.channel !== "all" || filters.segment !== "all" || !!filters.huntId || filters.period !== "30";

  return (
    <div
      role="search"
      aria-label="Filtros del tablero"
      aria-busy={pending}
      className="sticky top-0 z-20 -mx-4 border-b border-border bg-[color-mix(in_oklab,var(--background)_88%,transparent)] px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Período" className="inline-flex max-w-full flex-wrap rounded-button border border-border bg-faro-surface-1 p-1">
          {PERIOD_OPTS.map((o) => {
            const on = o.v === "custom" ? customOpen || filters.period === "custom" : filters.period === o.v && !customOpen;
            return (
              <button
                key={o.v}
                type="button"
                aria-pressed={on}
                onClick={() => (o.v === "custom" ? setCustomOpen(true) : (setCustomOpen(false), go({ period: o.v, from: null, to: null })))}
                className={cn(
                  "inline-flex min-h-8 shrink-0 items-center rounded-[7px] px-3 text-sm tabular-nums transition-colors",
                  on ? "bg-faro-accent font-semibold text-faro-accent-ink" : "text-faro-text-2 hover:text-white",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <select aria-label="Canal" className={selectCls} value={filters.channel} onChange={(e) => go({ channel: e.target.value as ChannelFilter })}>
          {CHANNEL_OPTS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
        <select aria-label="Segmento" className={selectCls} value={filters.segment} onChange={(e) => go({ segment: e.target.value as SegmentFilter })}>
          {SEGMENT_OPTS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
        {hunts.length > 0 && (
          <select aria-label="Búsqueda" className={cn(selectCls, "max-w-[14rem]")} value={filters.huntId ?? ""} onChange={(e) => go({ huntId: e.target.value || null })}>
            <option value="">Todas las búsquedas</option>
            {hunts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </select>
        )}
        {active && (
          <button
            type="button"
            onClick={() => (setCustomOpen(false), go({ period: "30", from: null, to: null, channel: "all", segment: "all", huntId: null }))}
            className="min-h-9 rounded-[8px] px-2.5 text-sm text-faro-text-2 underline-offset-4 hover:text-white hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>
      {customOpen && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to && from <= to) go({ period: "custom", from, to });
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-faro-text-3">
            Desde
            <input type="date" required value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={selectCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-faro-text-3">
            Hasta
            <input type="date" required value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={selectCls} />
          </label>
          <button type="submit" disabled={!from || !to || from > to} className="min-h-9 rounded-[8px] bg-white px-3 text-sm font-semibold text-black transition-opacity disabled:opacity-40">
            Aplicar
          </button>
        </form>
      )}
      <p className="mt-2 text-xs text-faro-text-3" aria-live="polite">
        {pending ? "Actualizando…" : summary}
      </p>
    </div>
  );
}
