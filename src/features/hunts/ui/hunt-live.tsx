"use client";

import { ArrowLeft, ArrowRight, Check, ChevronUp } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { NO_FILTER, filterPoints, sortForList } from "../filters";
import { hasLocation } from "../geojson";
import type { HuntSource, PointStatus, StreamPoint } from "../types";
import "./hunts.css";
import { HuntPanel, type PanelTab } from "./hunt-panel";
import { LeadDrawer } from "./lead-drawer";
import { StatusDot } from "./lead-list";
import type { FlyRequest } from "./map-view";
import { STATUS_LABEL, prettyCity } from "./format";
import { useHuntRunner, useHuntStream } from "./use-hunt-stream";

const MapView = dynamic(() => import("./map-view"), { ssr: false, loading: () => <div className="faro-skeleton absolute inset-0 !rounded-none" aria-label="Cargando el mapa" /> });

const SECTOR_TITLE: Record<string, string> = { dental: "Clínicas dentales", restaurant: "Restaurantes" };

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

type Snap = "peek" | "half" | "full";
const SNAP_CSS: Record<Snap, string> = { peek: "152px", half: "56dvh", full: "90dvh" };
const SNAP_ORDER: Snap[] = ["peek", "half", "full"];

function StatusPill({ status, active, isDemo }: { status: string | null; active: boolean; isDemo: boolean }) {
  const live = active || status === "running" || status === "pending";
  return (
    <div className="flex items-center gap-2">
      <span className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[12px] font-medium", live ? "border-faro-accent/50 text-white" : "border-white/20 text-faro-text-2")} data-testid="hunt-status">
        {live ? <span className="faro-live-dot" aria-hidden /> : status === "completed" ? <Check className="size-3.5 text-faro-accent" aria-hidden /> : null}
        {live ? "Buscando en vivo" : status === "completed" ? "Búsqueda completa" : status === "failed" ? "Con errores" : "Lista"}
      </span>
      {isDemo && (
        <span className="rounded-full border border-dashed border-white/50 px-2.5 py-1 text-[11px] font-bold tracking-[0.14em] text-white" data-testid="demo-badge" title="Datos sintéticos de demostración">
          DEMO
        </span>
      )}
    </div>
  );
}

export function HuntLive({ huntId, initialLeadId }: { huntId: string; initialLeadId?: string }) {
  const mobile = useMedia("(max-width: 767px)");
  const stream = useHuntStream(huntId);
  // Run only real hunts that still have unfinished sources (resumes after a closed tab).
  const unfinished = Object.values(stream.sources).some((s) => s && (s.state === "pending" || s.state === "running" || s.state === "error"));
  const runnerEnabled = !stream.isDemo && unfinished && stream.status !== null;
  const runner = useHuntRunner(huntId, runnerEnabled, stream.sources);
  const runnerActive = runner.active;


  const [query, setQuery] = useState("");
  const [srcFilter, setSrcFilter] = useState<ReadonlySet<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<ReadonlySet<PointStatus>>(new Set());
  const [tab, setTab] = useState<PanelTab>("leads");
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [fly, setFly] = useState<FlyRequest | null>(null);
  const [snap, setSnap] = useState<Snap>("half");
  const flyNonce = useRef(0);

  const toggle = <T,>(set: ReadonlySet<T>, v: T): ReadonlySet<T> => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  const filtered = useMemo(
    () => filterPoints(stream.points, { ...NO_FILTER, query, sources: srcFilter, statuses: statusFilter }),
    [stream.points, query, srcFilter, statusFilter],
  );
  const rows = useMemo(() => sortForList(filtered), [filtered]);
  const byId = useMemo(() => new Map(stream.points.map((p) => [p.id, p])), [stream.points]);

  const select = useCallback(
    (p: StreamPoint) => {
      setSelected({ id: p.id, name: p.name });
      if (hasLocation(p)) setFly({ lng: p.lng, lat: p.lat, zoom: 14.6, nonce: ++flyNonce.current });
      if (mobile) setSnap("peek");
    },
    [mobile],
  );
  const selectById = useCallback(
    (id: string) => {
      const p = byId.get(id);
      if (p) select(p);
    },
    [byId, select],
  );

  // Deep link ?lead=<id>
  const opened = useRef(false);
  useEffect(() => {
    if (!initialLeadId || opened.current || stream.loading) return;
    opened.current = true;
    setSelected({ id: initialLeadId, name: byId.get(initialLeadId)?.name ?? "Empresa" });
  }, [initialLeadId, stream.loading, byId]);

  const closeDrawer = useCallback(() => setSelected(null), []);

  // Map insets so the data never hides behind the panel / sheet / drawer.
  const [vh, setVh] = useState(900);
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const sheetPx = snap === "peek" ? 152 : snap === "half" ? vh * 0.56 : vh * 0.9;
  const padding = mobile ? { top: 84, right: 24, bottom: Math.min(sheetPx, vh * 0.55) + 24, left: 24 } : { top: 110, right: (selected ? 460 : 400) + 52, bottom: 60, left: 40 };
  const fitKey = `${[...srcFilter].sort()}|${[...statusFilter].sort()}`;

  // Bottom-sheet drag (mobile).
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const cycle = (dir: 1 | -1) => setSnap((s) => SNAP_ORDER[Math.min(2, Math.max(0, SNAP_ORDER.indexOf(s) + dir))]);

  const title = SECTOR_TITLE[stream.sector] ?? (stream.sector ? stream.sector.charAt(0).toUpperCase() + stream.sector.slice(1) : "Búsqueda");

  if (stream.notFound) {
    return (
      <main className="grid min-h-dvh place-items-center bg-black p-6 text-center">
        <div className="faro-rise max-w-sm">
          <h1 className="text-2xl font-semibold text-white">No encontramos esta búsqueda</h1>
          <p className="mt-2 text-sm text-faro-text-2">El enlace puede estar incompleto o la búsqueda ya no existe.</p>
          <Link href="/app/new" className="mt-6 inline-flex h-11 items-center rounded-[10px] bg-faro-accent px-5 text-sm font-semibold text-faro-accent-ink">
            Crear una búsqueda nueva
          </Link>
        </div>
      </main>
    );
  }

  const panel = (
    <HuntPanel
      huntId={huntId}
      counters={stream.counters}
      sources={stream.sources}
      runnerActive={runnerActive as ReadonlySet<HuntSource>}
      runnerErrors={runner.errors}
      onRetry={runner.retry}
      mergedDuplicates={stream.mergedDuplicates}
      rows={rows}
      totalPoints={stream.points.length}
      selectedId={selected?.id ?? null}
      onSelect={select}
      query={query}
      onQuery={setQuery}
      sourceFilter={srcFilter}
      onToggleSource={(s) => setSrcFilter((f) => toggle(f, s))}
      statusFilter={statusFilter}
      onToggleStatus={(s) => setStatusFilter((f) => toggle(f, s))}
      onClearFilters={() => {
        setQuery("");
        setSrcFilter(new Set());
        setStatusFilter(new Set());
      }}
      tab={tab}
      onTab={setTab}
      loading={stream.loading}
      compact={mobile}
    />
  );

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white" data-testid="hunt-live" style={{ ["--faro-sheet-h" as string]: SNAP_CSS[snap] }}>
      <MapView points={filtered} arrival={stream.arrival} selectedId={selected?.id ?? null} onSelect={selectById} fly={fly} padding={padding} fitKey={fitKey} />

      {/* title card */}
      <div className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[calc(100%-24px)] flex-col gap-2.5 md:top-4 md:left-4 md:max-w-[min(560px,calc(100%-480px))]">
        <div className="pointer-events-auto faro-rise flex items-center gap-3 rounded-[16px] border border-white/[0.14] bg-faro-surface-1/95 py-2.5 pr-4 pl-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          <Link href="/app/new" aria-label="Volver a nueva búsqueda" className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-white/[0.14] text-white transition-colors hover:border-faro-accent">
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[16px] leading-tight font-semibold md:text-[18px]" data-testid="hunt-title">
              {stream.loading ? <span className="faro-skeleton inline-block h-5 w-44 align-middle" /> : `${title}${stream.city ? ` · ${prettyCity(stream.city)}` : ""}`}
            </h1>
            <div className="mt-1.5">
              <StatusPill status={stream.status} active={runnerActive.size > 0} isDemo={stream.isDemo} />
            </div>
          </div>
          <Link
            href={`/app/hunts/${huntId}/outreach`}
            data-testid="to-outreach"
            className="ml-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-faro-accent px-3 text-[13px] font-semibold text-faro-accent-ink transition-[filter] hover:brightness-110"
          >
            Contactar <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        {!mobile && (
          <ul className="pointer-events-auto faro-rise hidden w-fit items-center gap-4 rounded-[10px] border border-white/[0.14] bg-faro-surface-1/95 px-3.5 py-2 text-[12px] text-faro-text-2 md:flex" aria-label="Leyenda del mapa" style={{ animationDelay: "80ms" }}>
            {(["found", "fit", "contacted", "qualified"] as const).map((s) => (
              <li key={s} className="flex items-center gap-2">
                <StatusDot status={s} />
                {STATUS_LABEL[s]}
              </li>
            ))}
          </ul>
        )}
      </div>

      {stream.error && !stream.loading && (
        <div role="alert" className="absolute top-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[10px] border border-[var(--faro-danger)]/50 bg-faro-surface-2 px-4 py-2 text-[13px] shadow-lg md:left-[calc(50%-200px)]">
          <span>Se perdió la conexión. Reintentando…</span>
          <button type="button" onClick={stream.retry} className="font-semibold text-faro-accent underline underline-offset-2">
            Reintentar ahora
          </button>
        </div>
      )}
      {stream.error && stream.loading === false && stream.status === null && (
        <div role="alert" className="absolute inset-x-4 top-24 z-40 mx-auto max-w-sm rounded-[16px] border border-white/20 bg-faro-surface-1 p-5 text-center">
          <p className="font-medium">No pudimos cargar la búsqueda</p>
          <button type="button" onClick={stream.retry} className="mt-3 h-10 rounded-[10px] bg-faro-accent px-4 text-sm font-semibold text-faro-accent-ink">
            Reintentar
          </button>
        </div>
      )}

      {/* desktop panel / mobile sheet */}
      {mobile ? (
        <section
          aria-label="Panel de la búsqueda"
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[16px] border-t border-white/[0.14] bg-faro-surface-1 shadow-[0_-18px_50px_rgba(0,0,0,0.6)] transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ height: SNAP_CSS[snap] }}
          data-testid="sheet"
          data-snap={snap}
        >
          <button
            type="button"
            aria-label={snap === "full" ? "Reducir el panel" : "Ampliar el panel"}
            aria-expanded={snap !== "peek"}
            onClick={() => (drag.current?.moved ? undefined : cycle(snap === "full" ? -1 : 1))}
            onPointerDown={(e) => {
              drag.current = { y: e.clientY, moved: false };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              if (d && Math.abs(e.clientY - d.y) > 24) {
                d.moved = true;
                cycle(e.clientY < d.y ? 1 : -1);
                setTimeout(() => (drag.current = null), 50);
              } else drag.current = null;
            }}
            className="grid h-7 shrink-0 place-items-center touch-none"
          >
            <span className="h-1 w-10 rounded-full bg-white/30" />
            <ChevronUp className="sr-only" />
          </button>
          <div className="min-h-0 flex-1 overflow-hidden">{panel}</div>
        </section>
      ) : (
        <aside aria-label="Panel de la búsqueda" className="faro-rise absolute top-3 right-3 bottom-3 z-20 w-[400px] overflow-hidden rounded-[16px] border border-white/[0.14] bg-faro-surface-1 shadow-[0_24px_60px_rgba(0,0,0,0.55)]" style={{ animationDelay: "120ms" }} data-testid="panel">
          {panel}
        </aside>
      )}

      {selected && <LeadDrawer key={selected.id} huntId={huntId} leadId={selected.id} name={selected.name} onClose={closeDrawer} mobile={mobile} />}
    </main>
  );
}
