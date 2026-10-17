"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Counters, HuntSource, HuntSourcesProgress, StreamPoint, StreamResponse } from "../types";

type StreamData = StreamResponse & { rev: string };

export interface ArrivalBatch {
  id: number;
  points: Array<{ id: string; lng: number; lat: number }>;
}

export interface HuntStreamState {
  loading: boolean;
  error: string | null;
  notFound: boolean;
  status: StreamResponse["status"] | null;
  isDemo: boolean;
  prompt: string;
  city: string;
  sector: string;
  points: StreamPoint[];
  counters: Counters | null;
  sources: Partial<HuntSourcesProgress>;
  mergedDuplicates: number;
  /** Increments when points/statuses change (cheap memo key for the map). */
  version: number;
  /** The most recent live batch (small enough to animate). Null on first load. */
  arrival: ArrivalBatch | null;
  retry: () => void;
}

const LIVE_MS = 1200;
const IDLE_MS = 4500;
/** Batches larger than this are the initial load, not "live arrivals": no per-point animation. */
const MAX_ANIMATED = 400;

/** Incremental polling of `/api/hunts/[id]/stream`: merges new points and status updates into a Map. */
export function useHuntStream(huntId: string): HuntStreamState {
  const pointsRef = useRef(new Map<string, StreamPoint>());
  const sinceRef = useRef(0);
  const revRef = useRef<string | undefined>(undefined);
  const [points, setPoints] = useState<StreamPoint[]>([]);
  const batchId = useRef(0);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<StreamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [arrival, setArrival] = useState<ArrivalBatch | null>(null);
  const [nonce, setNonce] = useState(0);
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const schedule = (ms: number) => {
      if (!cancelled) timer = setTimeout(tick, ms);
    };

    async function tick() {
      if (cancelled) return;
      if (document.hidden) return schedule(IDLE_MS);
      try {
        const q = new URLSearchParams({ since: String(sinceRef.current) });
        if (revRef.current) q.set("rev", revRef.current);
        const res = await fetch(`/api/hunts/${huntId}/stream?${q}`, { cache: "no-store" });
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as StreamData;
        if (cancelled) return;
        failures = 0;
        let changed = false;
        const fresh: ArrivalBatch["points"] = [];
        for (const p of d.points) {
          if (!pointsRef.current.has(p.id)) {
            pointsRef.current.set(p.id, p);
            changed = true;
            if (p.lat != null && p.lng != null) fresh.push({ id: p.id, lat: p.lat, lng: p.lng });
          }
        }
        for (const u of d.updates) {
          const cur = pointsRef.current.get(u.id);
          if (cur && cur.status !== u.status) {
            pointsRef.current.set(u.id, { ...cur, status: u.status });
            changed = true;
          }
        }
        sinceRef.current = d.cursor;
        revRef.current = d.rev;
        setData(d);
        setError(null);
        if (changed) {
          setPoints(Array.from(pointsRef.current.values()));
          setVersion((v) => v + 1);
        }
        if (!firstLoad.current && fresh.length > 0 && fresh.length <= MAX_ANIMATED) {
          setArrival({ id: ++batchId.current, points: fresh });
        }
        firstLoad.current = false;
        const live = d.status === "running" || d.status === "pending" || Object.values(d.sources).some((s) => s && (s.state === "pending" || s.state === "running"));
        schedule(d.hasMore ? 60 : live ? LIVE_MS : IDLE_MS);
      } catch (e) {
        if (cancelled) return;
        failures++;
        setError(e instanceof Error ? e.message : "Sin conexión");
        schedule(Math.min(15_000, 1500 * 2 ** Math.min(failures, 4)));
      }
    }
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [huntId, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return {
    loading: data === null && !error && !notFound,
    error: data === null ? error : error,
    notFound,
    status: data?.status ?? null,
    isDemo: data?.isDemo ?? false,
    prompt: data?.prompt ?? "",
    city: data?.city ?? "",
    sector: data?.sector ?? "",
    points,
    counters: data?.counters ?? null,
    sources: data?.sources ?? {},
    mergedDuplicates: data?.duplicates.merged ?? 0,
    version,
    arrival,
    retry,
  };
}

export type RunnerErrors = Partial<Record<HuntSource, string>>;

/**
 * Drives the batches from the browser: one loop per source, in parallel, resuming from the persisted cursor.
 * Each request is one batch (< 60 s). Stops on completion; retries a failed batch 3 times before surfacing the error.
 */
export function useHuntRunner(huntId: string, enabled: boolean, sources: Partial<HuntSourcesProgress>, onFinished?: () => void) {
  const [active, setActive] = useState<Set<HuntSource>>(new Set());
  const [errors, setErrors] = useState<RunnerErrors>({});
  const running = useRef(new Set<HuntSource>());
  const [nonce, setNonce] = useState(0);
  const sourcesRef = useRef(sources);
  const finishedRef = useRef(onFinished);
  useEffect(() => {
    sourcesRef.current = sources;
    finishedRef.current = onFinished;
  });

  const setOn = (s: HuntSource, on: boolean) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (on) next.add(s);
      else next.delete(s);
      return next;
    });

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const hasSources = Object.keys(sources).length > 0;
  useEffect(() => {
    if (!enabled || !hasSources) return;
    const todo = (Object.keys(sourcesRef.current) as HuntSource[]).filter((s) => {
      const st = sourcesRef.current[s]?.state;
      return (st === "pending" || st === "running" || st === "error") && !running.current.has(s);
    });
    for (const source of todo) {
      running.current.add(source);
      setOn(source, true);
      void (async () => {
        let cursor: number | undefined = undefined;
        let attempts = 0;
        try {
          while (alive.current) {
            const url = `/api/hunts/${huntId}/run?source=${source}${cursor !== undefined ? `&cursor=${cursor}` : ""}`;
            const res = await fetch(url, { method: "POST" });
            if (res.ok) {
              const r = (await res.json()) as { nextCursor: number; done: boolean };
              attempts = 0;
              setErrors((e) => ({ ...e, [source]: undefined }));
              if (r.done) break;
              cursor = r.nextCursor;
              continue;
            }
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            if (res.status === 409 || res.status === 404 || ++attempts >= 3) {
              setErrors((e) => ({ ...e, [source]: body.error ?? `HTTP ${res.status}` }));
              break;
            }
            await new Promise((r) => setTimeout(r, 2500 * attempts));
          }
        } catch (e) {
          setErrors((er) => ({ ...er, [source]: e instanceof Error ? e.message : "Sin conexión" }));
        } finally {
          running.current.delete(source);
          setOn(source, false);
          if (running.current.size === 0) finishedRef.current?.();
        }
      })();
    }
  }, [huntId, enabled, hasSources, nonce]);

  const retry = useCallback(() => {
    setErrors({});
    setNonce((n) => n + 1);
  }, []);
  return { active, errors, retry };
}
