import type { MergedPair } from "@/features/dedupe/plan";

/** Sources a hunt can run (subset of `source_channel` that Faro queries by itself). */
export const HUNT_SOURCES = ["osm", "rues", "reps"] as const;
export type HuntSource = (typeof HUNT_SOURCES)[number];

/** Map-level lead status: what the colour of a point means. */
export type PointStatus = "found" | "fit" | "contacted" | "qualified";

export const POINT_STATUSES: readonly PointStatus[] = ["found", "fit", "contacted", "qualified"];

export type SourceState = "pending" | "running" | "done" | "error" | "skipped";

export interface SourceLogEntry {
  at: string;
  text: string;
}

/** Persisted in `hunts.progress.sources[source]`. Enough to resume after a crash or a closed tab. */
export interface SourceProgress {
  state: SourceState;
  /** Offset into the (deterministic) result list of the source: next batch starts here. */
  cursor: number;
  /** Size of the source result list, known after the first batch. */
  total: number | null;
  fetched: number;
  /** Records dropped because the name reads like a natural person (counted, never stored). */
  excludedPersonal?: number;
  isMock: boolean;
  error?: string;
  /** Why it is skipped (e.g. RUES does not cover Miami). */
  reason?: string;
  log: SourceLogEntry[];
  /** Multi-city hunts only: index (into the hunt cities) of the city `cursor` points into. Cities run in sequence. */
  city?: number;
  /** Multi-city hunts only: per-city progress of this source (same order as the hunt cities). */
  cities?: CityProgress[];
}

/** Progress of one source in one city of a multi-city hunt. */
export interface CityProgress {
  name: string;
  state: "pending" | "running" | "done";
  total: number | null;
  fetched: number;
  excluded: number;
}

export type HuntSourcesProgress = Record<HuntSource, SourceProgress>;

/** One point of the live map/list. `lat`/`lng` are null for registry sources (RUES/REPS have no coordinates). */
export interface StreamPoint {
  id: string;
  lat: number | null;
  lng: number | null;
  /** Approximate spot inside the company's city area when the source has no coordinates (drawn faded, never as exact). */
  approx?: { lat: number; lng: number } | null;
  status: PointStatus;
  source: string;
  name: string;
  score: number | null;
}

export interface StatusUpdate {
  id: string;
  status: PointStatus;
}

export interface SourceCounters {
  /** Unique companies found (leads) whose primary source is this one. */
  found: number;
  /** Leads with fit (status fit, contacted or qualified). */
  fit: number;
  contacted: number;
  qualified: number;
  /** Duplicates fused into a lead of another source or of the same one, attributed to the merged record's source. */
  duplicates: number;
}

export interface Counters {
  /** Real leads only (or everything, for a hunt that is entirely DEMO). */
  total: SourceCounters;
  /** Per source, whatever its mode: the row carries its own Real/Mock label. */
  bySource: Record<string, SourceCounters>;
  /** Mock/demo leads of a real hunt, never added to `total`. Null when there are none. */
  test: SourceCounters | null;
}

export interface StreamResponse {
  huntId: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  isDemo: boolean;
  prompt: string;
  city: string;
  /** Every city of the hunt (one entry on single-city hunts) with its bbox when known, for the map framing. */
  cities: Array<{ name: string; bbox?: [number, number, number, number] }>;
  /** "Bogotá", "Bogotá +2" or "Colombia (5 ciudades)". */
  area: string;
  sector: string;
  /** Epoch ms of the newest lead returned; send it back as `since`. */
  cursor: number;
  hasMore: boolean;
  points: StreamPoint[];
  updates: StatusUpdate[];
  counters: Counters;
  sources: Partial<HuntSourcesProgress>;
  /** Automatic website enrichment (Apify) chosen when the hunt was created, and when it finished. */
  enrich: { auto: boolean; doneAt: string | null };
  duplicates: { merged: number; mock: number };
}

export type { MergedPair };

export const emptySourceCounters = (): SourceCounters => ({ found: 0, fit: 0, contacted: 0, qualified: 0, duplicates: 0 });
