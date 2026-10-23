import { findSector, huntCities } from "@/features/icp/presets";
import { isTourismSector, sectorNameKeywords } from "./keywords";
import type { IcpCriteria } from "@/features/icp/schema";
import { HUNT_SOURCES, type HuntSource, type HuntSourcesProgress, type SourceProgress } from "./types";

/** Companies/rows processed per `run` call. Keeps every request far below 60 s. */
export const BATCH_SIZE = 200;

export interface SourcePlan {
  applicable: boolean;
  /** Human reason when the source does not apply to this ICP. */
  reason?: string;
}

/** Which sources can answer this ICP (RUES/REPS only cover Colombia; REPS only health). */
export function planSources(c: Pick<IcpCriteria, "osmTags" | "ciiu" | "country" | "sector" | "city" | "bbox" | "cities" | "nameKeywords">): Record<HuntSource, SourcePlan> {
  const co = c.country.toUpperCase() === "CO";
  const health = findSector(c.sector)?.sector === "dental";
  return {
    osm: c.osmTags.length > 0 && (!!c.bbox || !!c.city) ? { applicable: true } : { applicable: false, reason: "Sin etiquetas OSM o ubicación" },
    rues: co && c.ciiu.length > 0 ? { applicable: true } : { applicable: false, reason: co ? "Sin código CIIU" : "RUES solo cubre Colombia" },
    reps: co && health ? { applicable: true } : { applicable: false, reason: co ? "REPS solo cubre salud" : "REPS solo cubre Colombia" },
    ...registryPlans(c, co),
  };
}

/** SECOP II / RNT / Supersolidaria are filtered by sector words in the name: no words, no query. RNT only covers tourism. */
function registryPlans(c: Pick<IcpCriteria, "sector" | "nameKeywords">, co: boolean): Pick<Record<HuntSource, SourcePlan>, "secop" | "rnt" | "solidaria"> {
  const words = sectorNameKeywords(c).length > 0;
  const off = (name: string): SourcePlan => ({ applicable: false, reason: co ? "Sin palabras de sector para buscar" : `${name} solo cubre Colombia` });
  return {
    secop: co && words ? { applicable: true } : off("SECOP II"),
    rnt: co && words && isTourismSector(c.sector) ? { applicable: true } : co ? { applicable: false, reason: "RNT solo cubre turismo" } : off("RNT"),
    solidaria: co && words ? { applicable: true } : off("Supersolidaria"),
  };
}

const freshSource = (plan: SourcePlan, cities: string[]): SourceProgress => ({
  state: plan.applicable ? "pending" : "skipped",
  cursor: 0,
  total: null,
  fetched: 0,
  isMock: false,
  reason: plan.reason,
  log: [],
  // Multi-city: the source walks the cities in order; `cursor` is the offset inside `cities[city]`.
  ...(cities.length > 1 && plan.applicable ? { city: 0, cities: cities.map((name) => ({ name, state: "pending" as const, total: null, fetched: 0, excluded: 0 })) } : {}),
});

export function initialSourcesProgress(c: Parameters<typeof planSources>[0]): HuntSourcesProgress {
  const plan = planSources(c);
  const cities = huntCities(c).map((x) => x.name);
  return Object.fromEntries(HUNT_SOURCES.map((s) => [s, freshSource(plan[s], cities)])) as HuntSourcesProgress;
}

export interface BatchSlice<T> {
  items: T[];
  nextCursor: number;
  done: boolean;
}

/** Slices a deterministic list. `done` once the cursor reaches the end. Out-of-range cursors yield an empty, done batch. */
export function sliceBatch<T>(list: readonly T[], cursor: number, size = BATCH_SIZE): BatchSlice<T> {
  const start = Math.max(0, Math.trunc(cursor) || 0);
  const items = list.slice(start, start + size);
  const nextCursor = start + items.length;
  return { items, nextCursor, done: nextCursor >= list.length };
}

/** Next unit of work to resume a hunt: first applicable source that is not done. */
export function nextWork(progress: Partial<HuntSourcesProgress> | undefined): { source: HuntSource; cursor: number; city?: number } | null {
  for (const s of HUNT_SOURCES) {
    const p = progress?.[s];
    if (p && (p.state === "pending" || p.state === "running" || p.state === "error")) return { source: s, cursor: p.cursor, ...(p.city !== undefined ? { city: p.city } : {}) };
  }
  return null;
}

/** True when every applicable source finished (skipped ones do not count). */
export function allDone(progress: Partial<HuntSourcesProgress> | undefined): boolean {
  return HUNT_SOURCES.every((s) => !progress?.[s] || progress[s]!.state === "done" || progress[s]!.state === "skipped");
}

export const isHuntSource = (s: string | null | undefined): s is HuntSource => !!s && (HUNT_SOURCES as readonly string[]).includes(s);
