import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cacheKey, HttpError, requestJson, USER_AGENT } from "@/lib/http";
import { normalizePhone } from "./phone";
import {
  OSM_LICENSE,
  type ApiCallLogger,
  type BBox,
  type OsmPlace,
  type OverpassAdapter,
  type OverpassCriteria,
  type OverpassQuery,
  type OverpassResult,
  type SourceCompany,
} from "./types";

export const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

/** Known city bounding boxes (avoids a slow `area` lookup). Keys are lowercase, no accents. */
export const CITY_BBOX: Record<string, BBox> = {
  bogota: { south: 4.45, west: -74.25, north: 4.84, east: -73.99 },
  medellin: { south: 6.17, west: -75.7, north: 6.37, east: -75.5 },
  cali: { south: 3.32, west: -76.6, north: 3.55, east: -76.45 },
  barranquilla: { south: 10.9, west: -74.9, north: 11.05, east: -74.75 },
  miami: { south: 25.7, west: -80.32, north: 25.86, east: -80.12 },
};

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** `["amenity=dentist", "shop"]` -> `[{amenity:"dentist"}, {shop:"*"}]` (`*` = key exists). */
export function parseTagFilters(tags: readonly string[]): Array<Record<string, string>> {
  return tags
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const i = t.indexOf("=");
      return i < 0 ? { [t]: "*" } : { [t.slice(0, i).trim()]: t.slice(i + 1).trim() || "*" };
    });
}

/** Converts `icp_profiles.criteria` to a query. Throws if it has neither tags nor a location. */
export function queryFromCriteria(c: OverpassCriteria, timeoutSec?: number): OverpassQuery {
  const tags = parseTagFilters(c.tags ?? []);
  if (tags.length === 0) throw new Error("Overpass criteria needs at least one OSM tag");
  if (!c.bbox && !c.city) throw new Error("Overpass criteria needs a bbox or a city");
  return { tags, bbox: c.bbox, city: c.city, country: c.country, timeoutSec };
}

function resolveBBox(q: OverpassQuery): BBox | undefined {
  return q.bbox ?? (q.city ? CITY_BBOX[slug(q.city)] : undefined);
}

/** Builds Overpass QL: union of node+way per tag filter inside the bbox (or named area), `out center tags`. */
export function buildOverpassQuery(q: OverpassQuery): string {
  const box = resolveBBox(q);
  if (!box && !q.city) throw new Error("Overpass query needs a bbox or a city");
  const scope = box ? `(${box.south},${box.west},${box.north},${box.east})` : "(area.a)";
  const prelude = box ? "" : `area["name"="${esc(q.city!)}"]["boundary"="administrative"]->.a;`;
  const parts = q.tags.flatMap((filter) => {
    const f = Object.entries(filter)
      .map(([k, v]) => (v === "*" ? `["${esc(k)}"]` : `["${esc(k)}"="${esc(v)}"]`))
      .join("");
    return [`node${f}${scope};`, `way${f}${scope};`];
  });
  return `[out:json][timeout:${q.timeoutSec ?? 90}];${prelude}(${parts.join("")});out center tags;`;
}

interface RawElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const first = (...v: Array<string | undefined>) => v.find((x) => x && x.trim())?.trim();

/** Tags that may hold a person's name; never stored in `raw`. */
const PERSONAL_TAGS = new Set(["operator", "owner", "contact:person", "contact:name", "contact:owner"]);

export function parseOverpass(json: { elements?: RawElement[] }): OsmPlace[] {
  const seen = new Set<string>();
  const places: OsmPlace[] = [];
  for (const el of json.elements ?? []) {
    if (el.type !== "node" && el.type !== "way" && el.type !== "relation") continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = el.tags ?? {};
    const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
    places.push({
      id,
      // brand only as a fallback: `operator` is often a person's name.
      name: first(t.name, t.brand),
      lat: el.lat ?? el.center?.lat,
      lng: el.lon ?? el.center?.lon,
      website: first(t.website, t["contact:website"], t.url),
      phone: first(t.phone, t["contact:phone"], t["contact:mobile"], t.mobile),
      email: first(t.email, t["contact:email"]),
      address: first(street, t["addr:full"]),
      tags: t,
    });
  }
  return places;
}

/** Normalises places into `SourceCompany`. Elements without a name are dropped (nothing to contact or dedupe on). */
export function toSourceCompanies(places: readonly OsmPlace[], opts: { city?: string; country?: string; isMock?: boolean } = {}): SourceCompany[] {
  const out: SourceCompany[] = [];
  for (const p of places) {
    if (!p.name) continue;
    const safeTags = Object.fromEntries(Object.entries(p.tags).filter(([k]) => !PERSONAL_TAGS.has(k)));
    out.push({
      name: p.name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      city: first(p.tags["addr:city"], opts.city),
      website: p.website,
      phone: normalizePhone(p.phone, opts.country),
      email: p.email?.toLowerCase(),
      externalId: `osm:${p.id}`,
      sourceUrl: `https://www.openstreetmap.org/${p.id}`,
      license: OSM_LICENSE,
      sourceChannel: "osm",
      isMock: opts.isMock ?? false,
      raw: { osm_id: p.id, lat: p.lat, lon: p.lng, tags: safeTags },
    });
  }
  return out;
}

export interface RealOverpassOptions {
  endpoints?: string[];
  /** Disk cache directory; omit to disable caching. */
  cacheDir?: string;
  cacheTtlMs?: number;
  /** Minimum ms between network requests (Overpass fair use). */
  minIntervalMs?: number;
  retries?: number;
  backoffMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Receives one record per real network attempt (wire it to `api_calls`). */
  onApiCall?: ApiCallLogger;
}

interface CacheEntry {
  at: number;
  latencyMs: number;
  endpoint: string;
  data: { elements?: RawElement[] };
}

export function createRealOverpass(opts: RealOverpassOptions = {}): OverpassAdapter {
  const endpoints = opts.endpoints ?? OVERPASS_ENDPOINTS;
  const minInterval = opts.minIntervalMs ?? 2_000;
  const ttl = opts.cacheTtlMs ?? 24 * 3600_000;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last = 0;
  // Serialises network work: one Overpass request in flight at a time.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  const log = async (call: Parameters<ApiCallLogger>[0]) => {
    try {
      await opts.onApiCall?.(call);
    } catch {
      /* logging must never break a search */
    }
  };

  async function fetchRaw(ql: string, timeoutSec: number): Promise<CacheEntry> {
    const errors: string[] = [];
    for (const endpoint of endpoints) {
      const wait = last + minInterval - now();
      if (wait > 0) await sleep(wait);
      last = now();
      const started = now();
      try {
        const res = await requestJson<{ elements?: RawElement[] }>(endpoint, {
          method: "POST",
          body: `data=${encodeURIComponent(ql)}`,
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
          timeoutMs: (timeoutSec + 15) * 1000,
          retries: opts.retries ?? 2,
          backoffMs: opts.backoffMs ?? 5_000,
          fetchImpl: opts.fetchImpl,
          sleep,
        });
        await log({ service: "overpass", endpoint, status: 200, latencyMs: res.latencyMs, error: null, costUsd: 0, isMock: false });
        return { at: now(), latencyMs: res.latencyMs, endpoint, data: res.data };
      } catch (err) {
        const message = (err as Error).message;
        errors.push(`${new URL(endpoint).host}: ${message}`);
        await log({
          service: "overpass",
          endpoint,
          status: err instanceof HttpError ? (err.status ?? null) : null,
          latencyMs: now() - started,
          error: message,
          costUsd: 0,
          isMock: false,
        });
      }
    }
    throw new Error(`Overpass failed on all endpoints (${errors.join("; ")})`);
  }

  async function readCache(file: string): Promise<CacheEntry | undefined> {
    try {
      const raw = JSON.parse(await readFile(file, "utf8")) as CacheEntry;
      return now() - raw.at < ttl ? raw : undefined;
    } catch {
      return undefined;
    }
  }

  return {
    async search(query: OverpassQuery): Promise<OverpassResult> {
      const ql = buildOverpassQuery(query);
      const file = opts.cacheDir ? path.join(opts.cacheDir, cacheKey("overpass", ql) + ".json") : undefined;
      let entry = file ? await readCache(file) : undefined;
      const fromCache = !!entry;
      if (!entry) {
        entry = await serial(() => fetchRaw(ql, query.timeoutSec ?? 90));
        if (file) {
          try {
            await mkdir(opts.cacheDir!, { recursive: true });
            await writeFile(file, JSON.stringify(entry));
          } catch {
            /* cache is best-effort */
          }
        }
      }
      const places = parseOverpass(entry.data);
      return {
        places,
        companies: toSourceCompanies(places, { city: query.city, country: query.country }),
        latencyMs: entry.latencyMs,
        endpoint: entry.endpoint,
        fromCache,
        isMock: false,
      };
    },
  };
}
