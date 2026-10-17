"use client";

import { AlertTriangle, Check, GitMerge, RotateCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Attribution } from "@/components/attribution";
import type { MergedPair } from "@/features/dedupe/plan";
import { cn } from "@/lib/utils";
import type { Counters, HuntSource, HuntSourcesProgress, PointStatus, SourceProgress, StreamPoint } from "../types";
import { POINT_STATUSES } from "../types";
import { REASON_LABEL, SOURCE_LABEL, SOURCE_SHORT, STATUS_LABEL, fmtClock, fmtInt } from "./format";
import { LeadList, StatusDot } from "./lead-list";
import { useCountUp } from "./use-count-up";
import type { RunnerErrors } from "./use-hunt-stream";

export type PanelTab = "leads" | "dupes" | "timeline";

export interface PanelProps {
  huntId: string;
  counters: Counters | null;
  sources: Partial<HuntSourcesProgress>;
  runnerActive: ReadonlySet<HuntSource>;
  runnerErrors: RunnerErrors;
  onRetry: () => void;
  mergedDuplicates: number;
  rows: readonly StreamPoint[];
  totalPoints: number;
  selectedId: string | null;
  onSelect: (p: StreamPoint) => void;
  query: string;
  onQuery: (q: string) => void;
  sourceFilter: ReadonlySet<string>;
  onToggleSource: (s: string) => void;
  statusFilter: ReadonlySet<PointStatus>;
  onToggleStatus: (s: PointStatus) => void;
  onClearFilters: () => void;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  loading: boolean;
  /** Phone layout: sources collapse to one row of pills so the list keeps room. */
  compact?: boolean;
}

function Big({ value, label, accent, loading }: { value: number; label: string; accent?: boolean; loading: boolean }) {
  const n = useCountUp(value);
  return (
    <div className="min-w-0">
      {loading ? (
        <div className="faro-skeleton h-8 w-16" />
      ) : (
        <div className={cn("text-[25px] leading-none font-semibold tabular-nums md:text-[30px]", accent ? "text-faro-accent" : "text-white")} style={{ fontFamily: "var(--font-poppins)", letterSpacing: "-0.03em" }}>
          {fmtInt(n)}
        </div>
      )}
      <div className="mt-1.5 text-[12px] leading-tight text-faro-text-2">{label}</div>
    </div>
  );
}

function stateText(p: SourceProgress, active: boolean, error?: string): { text: string; tone: "ok" | "run" | "warn" | "mute" } {
  if (error || p.state === "error") return { text: error ?? p.error ?? "Error de la fuente", tone: "warn" };
  if (p.state === "skipped") return { text: p.reason ?? "No aplica a este perfil", tone: "mute" };
  if (p.state === "done") return { text: `Completa · ${fmtInt(p.fetched)} registros`, tone: "ok" };
  if (active || p.state === "running") return { text: p.total ? `Trayendo ${fmtInt(p.fetched)} de ${fmtInt(p.total)}` : "Consultando la fuente…", tone: "run" };
  return { text: "En cola", tone: "mute" };
}

function SourceRow({ id, p, counts, active, error, pressed, onToggle }: { id: HuntSource; p: SourceProgress; counts?: Counters["total"]; active: boolean; error?: string; pressed: boolean; onToggle: () => void }) {
  const st = stateText(p, active, error);
  const skipped = p.state === "skipped";
  const pct = p.state === "done" ? 100 : p.total ? Math.min(100, (p.fetched / p.total) * 100) : 0;
  const found = useCountUp(counts?.found ?? 0);
  const fit = useCountUp(counts?.fit ?? 0);
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={skipped}
      aria-pressed={pressed}
      aria-label={`Filtrar por ${SOURCE_LABEL[id]}`}
      className={cn(
        "group block w-full rounded-[10px] border px-3 py-2 text-left md:py-2.5 transition-colors disabled:cursor-default",
        pressed ? "border-faro-accent bg-faro-surface-2" : "border-white/[0.08] bg-faro-surface-1 enabled:hover:border-white/25",
        skipped && "opacity-55",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13.5px] font-semibold text-white">{SOURCE_LABEL[id]}</span>
        {!skipped && (
          <span className={cn("rounded-[5px] border px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase", p.isMock ? "border-dashed border-white/30 text-faro-text-2" : "border-faro-accent/50 text-faro-accent")}>
            {p.isMock ? "Mock" : "Real"}
          </span>
        )}
        <span className="ml-auto flex items-baseline gap-3 text-[12px] tabular-nums">
          <span className="text-white">
            {fmtInt(found)} <span className="text-faro-text-3">enc.</span>
          </span>
          <span className="text-faro-accent">
            {fmtInt(fit)} <span className="text-faro-text-3">perfil</span>
          </span>
        </span>
      </div>
      {!skipped && (
        <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de ${SOURCE_LABEL[id]}`}>
          <div className={cn("h-full rounded-full bg-faro-accent transition-[width] duration-700 ease-out", st.tone === "run" && "faro-beam")} style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className={cn("mt-1.5 items-center gap-1.5 text-[11.5px]", st.tone === "warn" ? "flex" : "hidden md:flex", st.tone === "warn" ? "text-[var(--faro-danger)]" : st.tone === "ok" ? "text-faro-text-2" : "text-faro-text-3")}>
        {st.tone === "ok" && <Check className="size-3 text-faro-accent" aria-hidden />}
        {st.tone === "warn" && <AlertTriangle className="size-3" aria-hidden />}
        {st.tone === "run" && <span className="faro-live-dot !size-1.5" aria-hidden />}
        <span className="truncate">{st.text}</span>
      </div>
    </button>
  );
}

function SourcePill({ id, p, counts, active, pressed, error, onToggle }: { id: HuntSource; p: SourceProgress; counts?: Counters["total"]; active: boolean; pressed: boolean; error?: string; onToggle: () => void }) {
  const skipped = p.state === "skipped";
  const running = active || p.state === "running";
  const pct = p.state === "done" ? 100 : p.total ? Math.min(100, (p.fetched / p.total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={skipped}
      aria-pressed={pressed}
      aria-label={`Filtrar por ${SOURCE_LABEL[id]}: ${counts?.found ?? 0} encontradas`}
      className={cn("relative flex h-10 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-[10px] border px-2.5 text-left", pressed ? "border-faro-accent bg-faro-surface-2" : "border-white/[0.1] bg-faro-surface-1", skipped && "opacity-50")}
    >
      {error || p.state === "error" ? <AlertTriangle className="size-3.5 shrink-0 text-[var(--faro-danger)]" aria-hidden /> : running ? <span className="faro-live-dot !size-1.5 shrink-0" aria-hidden /> : p.state === "done" ? <Check className="size-3.5 shrink-0 text-faro-accent" aria-hidden /> : null}
      <span className="min-w-0 truncate text-[12.5px] font-semibold text-white">{SOURCE_SHORT[id]}</span>
      <span className="ml-auto text-[12.5px] text-faro-text-2 tabular-nums">{skipped ? "—" : fmtInt(counts?.found ?? 0)}</span>
      {!skipped && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10"><span className="block h-full bg-faro-accent transition-[width] duration-700" style={{ width: `${pct}%` }} /></span>}
    </button>
  );
}

function Duplicates({ huntId, merged }: { huntId: string; merged: number }) {
  const [pairs, setPairs] = useState<MergedPair[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let off = false;
    fetch(`/api/hunts/${huntId}/duplicates`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { pairs: MergedPair[] }) => !off && (setPairs(d.pairs), setErr(false)))
      .catch(() => !off && setErr(true));
    return () => {
      off = true;
    };
  }, [huntId, merged]);

  if (err) return <p className="p-5 text-sm text-[var(--faro-danger)]">No se pudo cargar el detalle de duplicados.</p>;
  if (!pairs) return <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="faro-skeleton h-16" />)}</div>;
  if (pairs.length === 0)
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <GitMerge className="mx-auto size-6 text-faro-text-3" aria-hidden />
          <p className="mt-3 text-sm font-medium text-white">Aún no hay duplicados</p>
          <p className="mx-auto mt-1 max-w-[30ch] text-xs text-faro-text-3">Cuando dos fuentes describan la misma empresa, las fusionamos y verás aquí cada par.</p>
        </div>
      </div>
    );
  return (
    <ul className="faro-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3" data-testid="dupes-list">
      {pairs.slice(0, 200).map((p) => (
        <li key={`${p.mergedChannel}:${p.mergedExternalId}`} className="rounded-[10px] border border-white/[0.08] bg-faro-surface-1 p-3">
          <div className="flex items-start gap-2 text-[12.5px]">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-white">{p.keptName}</span>
              <span className="mt-1 flex items-center gap-1.5 text-faro-text-3">
                <GitMerge className="size-3 shrink-0 text-faro-accent" aria-hidden />
                <span className="truncate">
                  {p.mergedName} <span className="text-faro-text-2">({SOURCE_SHORT[p.mergedChannel] ?? p.mergedChannel})</span>
                </span>
              </span>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            {p.isMock && <span className="rounded-[5px] border border-dashed border-white/30 px-1.5 py-0.5 font-semibold tracking-wide text-faro-text-2 uppercase">Mock</span>}
            <span className="rounded-[5px] bg-faro-surface-3/60 px-1.5 py-0.5 font-medium text-white">{REASON_LABEL[p.reason] ?? p.reason}</span>
            <span className="rounded-[5px] bg-faro-surface-3/60 px-1.5 py-0.5 text-faro-text-2 tabular-nums">similitud {Math.round(p.similarity * 100)} %</span>
            {p.distanceMeters != null && <span className="rounded-[5px] bg-faro-surface-3/60 px-1.5 py-0.5 text-faro-text-2 tabular-nums">a {p.distanceMeters} m</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Timeline({ sources, active }: { sources: Partial<HuntSourcesProgress>; active: ReadonlySet<HuntSource> }) {
  const entries = useMemo(
    () =>
      (Object.keys(sources) as HuntSource[])
        .flatMap((s) => (sources[s]?.log ?? []).map((l) => ({ ...l, source: s })))
        .sort((a, b) => a.at.localeCompare(b.at)),
    [sources],
  );
  if (entries.length === 0)
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <p className="max-w-[30ch] text-xs text-faro-text-3">La línea de tiempo se llena a medida que cada fuente entrega su primer lote.</p>
      </div>
    );
  return (
    <ol className="faro-scroll min-h-0 flex-1 overflow-y-auto p-4" data-testid="timeline">
      {entries.map((e, i) => (
        <li key={`${e.at}${i}`} className="relative flex gap-3 pb-4 last:pb-0">
          {i < entries.length - 1 && <span aria-hidden className="absolute top-4 bottom-0 left-[4.5px] w-px bg-white/10" />}
          <span aria-hidden className={cn("relative z-10 mt-1.5 size-[10px] shrink-0 rounded-full border-2 border-faro-surface-1", e.source === "osm" ? "bg-faro-accent" : e.source === "rues" ? "bg-white" : "bg-faro-text-3")} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11.5px] text-faro-text-3">
              <span className="font-semibold text-faro-text-2">{SOURCE_LABEL[e.source]}</span>
              <time className="tabular-nums">{fmtClock(e.at)}</time>
            </div>
            <p className="mt-0.5 text-[13px] leading-snug text-white/90">{e.text}</p>
          </div>
        </li>
      ))}
      {active.size > 0 && (
        <li className="flex items-center gap-3 pt-4 text-xs text-faro-text-3">
          <span className="faro-live-dot" aria-hidden />
          Buscando en {[...active].map((s) => SOURCE_SHORT[s]).join(", ")}…
        </li>
      )}
    </ol>
  );
}

export function HuntPanel(p: PanelProps) {
  const t = p.counters?.total;
  const filtersOn = p.query.trim() !== "" || p.sourceFilter.size > 0 || p.statusFilter.size > 0;
  const srcKeys = (["osm", "rues", "reps"] as const).filter((k) => p.sources[k]);
  const loading = p.loading;
  const tabs: Array<{ id: PanelTab; label: string; n?: number }> = [
    { id: "leads", label: "Empresas", n: p.rows.length },
    { id: "dupes", label: "Duplicados", n: p.mergedDuplicates },
    { id: "timeline", label: "Línea de tiempo" },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-5 pt-3 pb-3 md:pt-5 md:pb-4" aria-live="polite">
      <div className="grid grid-cols-3 gap-3">
        <Big loading={loading} value={t?.found ?? 0} label="Empresas encontradas" />
        <Big loading={loading} value={t?.fit ?? 0} label="Del perfil" accent />
        <Big loading={loading} value={t?.duplicates ?? p.mergedDuplicates} label="Duplicados fusionados" />
      </div>
      {p.counters?.test && (p.counters.test.found > 0 || p.counters.test.duplicates > 0) && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-[8px] border border-dashed border-white/30 px-2.5 py-1 text-[12px] text-faro-text-2" data-testid="test-counter">
          <span className="font-semibold tracking-wide text-white">PRUEBA</span>
          +{fmtInt(p.counters.test.found)} mock, {fmtInt(p.counters.test.fit)} del perfil, {fmtInt(p.counters.test.duplicates)} duplicados: no suman a los totales reales
        </p>
      )}
      </div>

      <div className={cn("px-4 pb-3", p.compact ? "flex gap-2" : "space-y-2")}>
        {loading
          ? [0, 1, 2].map((i) => <div key={i} className={cn("faro-skeleton", p.compact ? "h-10 flex-1" : "h-[74px]")} />)
          : p.compact
            ? srcKeys.map((k) => (
                <SourcePill key={k} id={k} p={p.sources[k]!} counts={p.counters?.bySource[k]} active={p.runnerActive.has(k)} error={p.runnerErrors[k]} pressed={p.sourceFilter.has(k)} onToggle={() => p.onToggleSource(k)} />
              ))
            : srcKeys.map((k) => (
              <SourceRow key={k} id={k} p={p.sources[k]!} counts={p.counters?.bySource[k]} active={p.runnerActive.has(k)} error={p.runnerErrors[k]} pressed={p.sourceFilter.has(k)} onToggle={() => p.onToggleSource(k)} />
            ))}
        {Object.values(p.runnerErrors).some(Boolean) && (
          <button type="button" onClick={p.onRetry} className="flex shrink-0 items-center gap-1.5 rounded-[10px] border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:border-faro-accent">
            <RotateCw className="size-3.5" aria-hidden /> Reintentar fuentes con error
          </button>
        )}
      </div>

      <div role="tablist" aria-label="Detalle de la búsqueda" className="flex gap-1 border-y border-white/[0.08] px-3">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            role="tab"
            id={`tab-${tb.id}`}
            aria-selected={p.tab === tb.id}
            aria-controls={`panel-${tb.id}`}
            onClick={() => p.onTab(tb.id)}
            className={cn("relative px-3 py-3 text-[13px] font-medium transition-colors", p.tab === tb.id ? "text-white" : "text-faro-text-3 hover:text-white")}
          >
            {tb.label}
            {tb.n != null && <span className="ml-1.5 text-[11.5px] text-faro-text-3 tabular-nums">{fmtInt(tb.n)}</span>}
            {p.tab === tb.id && <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-faro-accent" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${p.tab}`} aria-labelledby={`tab-${p.tab}`} className="flex min-h-0 flex-1 flex-col">
        {p.tab === "leads" && (
          <>
            <div className="space-y-2.5 px-4 pt-3 pb-2">
              <label className="relative block">
                <span className="sr-only">Buscar empresa por nombre</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faro-text-3" aria-hidden />
                <input
                  value={p.query}
                  onChange={(e) => p.onQuery(e.target.value)}
                  placeholder="Buscar por nombre"
                  className="h-10 w-full rounded-[10px] border border-white/[0.14] bg-faro-surface-1 pr-9 pl-9 text-[13.5px] text-white placeholder:text-faro-text-3 focus:border-faro-accent focus:outline-none"
                />
                {p.query && (
                  <button type="button" onClick={() => p.onQuery("")} aria-label="Borrar búsqueda" className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-faro-text-3 hover:text-white">
                    <X className="size-3.5" aria-hidden />
                  </button>
                )}
              </label>
              <div className="faro-scroll flex items-center gap-1.5 overflow-x-auto md:flex-wrap md:overflow-visible" role="group" aria-label="Filtrar por estado">
                {POINT_STATUSES.map((s) => {
                  const on = p.statusFilter.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() => p.onToggleStatus(s)}
                      className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors", on ? "border-faro-accent bg-faro-surface-2 text-white" : "border-white/[0.14] text-faro-text-2 hover:border-white/30 hover:text-white")}
                    >
                      <StatusDot status={s} className="!size-2" />
                      {s === "fit" ? "Solo del perfil" : STATUS_LABEL[s]}
                      <span className="text-faro-text-3 tabular-nums">{fmtInt(s === "found" ? (t?.found ?? 0) - (t?.fit ?? 0) : s === "fit" ? (t?.fit ?? 0) - (t?.contacted ?? 0) : s === "contacted" ? (t?.contacted ?? 0) - (t?.qualified ?? 0) : (t?.qualified ?? 0))}</span>
                    </button>
                  );
                })}
                {filtersOn && (
                  <button type="button" onClick={p.onClearFilters} className="ml-auto text-[12px] font-medium text-faro-text-2 underline underline-offset-2 hover:text-white">
                    Limpiar
                  </button>
                )}
              </div>
            </div>
            {loading ? (
              <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="faro-skeleton h-[52px]" />)}</div>
            ) : p.rows.length === 0 ? (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div>
                  <p className="text-sm font-medium text-white">{p.totalPoints === 0 ? "Esperando las primeras empresas" : "Nada coincide con esos filtros"}</p>
                  <p className="mx-auto mt-1 max-w-[32ch] text-xs text-faro-text-3">
                    {p.totalPoints === 0 ? "En cuanto una fuente entregue su primer lote, los puntos aparecen en el mapa." : "Prueba con otro nombre o limpia los filtros para ver las empresas."}
                  </p>
                  {p.totalPoints > 0 && (
                    <button type="button" onClick={p.onClearFilters} className="mt-4 rounded-[10px] border border-white/25 px-3.5 py-2 text-xs font-semibold text-white hover:border-faro-accent">
                      Limpiar filtros
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <LeadList rows={p.rows} selectedId={p.selectedId} onSelect={p.onSelect} scrollKey={`${p.query}|${[...p.sourceFilter]}|${[...p.statusFilter]}`} />
            )}
          </>
        )}
        {p.tab === "dupes" && <Duplicates huntId={p.huntId} merged={p.mergedDuplicates} />}
        {p.tab === "timeline" && <Timeline sources={p.sources} active={p.runnerActive} />}
      </div>

      <div className="border-t border-white/[0.08] px-5 py-3">
        <Attribution compact className="!text-[11px]" />
      </div>
    </div>
  );
}

