import { requestJson } from "@/lib/http";
import type { OsmPlace, OverpassAdapter, OverpassQuery, OverpassResult } from "./types";

export const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Builds Overpass QL: union of node+way per tag filter inside the bbox, `out center tags`. */
export function buildOverpassQuery(q: OverpassQuery): string {
  const { south, west, north, east } = q.bbox;
  const bbox = `(${south},${west},${north},${east})`;
  const parts = q.tags.flatMap((filter) => {
    const f = Object.entries(filter)
      .map(([k, v]) => `["${esc(k)}"="${esc(v)}"]`)
      .join("");
    return [`node${f}${bbox};`, `way${f}${bbox};`];
  });
  return `[out:json][timeout:${q.timeoutSec ?? 90}];(${parts.join("")});out center tags;`;
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

export function parseOverpass(json: { elements?: RawElement[] }): OsmPlace[] {
  const seen = new Set<string>();
  const places: OsmPlace[] = [];
  for (const el of json.elements ?? []) {
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = el.tags ?? {};
    const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
    places.push({
      id,
      name: first(t.name, t.brand, t.operator),
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

export interface RealOverpassOptions {
  endpoints?: string[];
  cacheDir?: string;
  /** Minimum ms between requests (Overpass fair use). */
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export function createRealOverpass(opts: RealOverpassOptions = {}): OverpassAdapter {
  const endpoints = opts.endpoints ?? OVERPASS_ENDPOINTS;
  const minInterval = opts.minIntervalMs ?? 2_000;
  let last = 0;
  return {
    async search(query: OverpassQuery): Promise<OverpassResult> {
      const ql = buildOverpassQuery(query);
      const errors: string[] = [];
      for (const endpoint of endpoints) {
        const wait = last + minInterval - Date.now();
        if (wait > 0) await (opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(wait);
        last = Date.now();
        try {
          const res = await requestJson<{ elements?: RawElement[] }>(endpoint, {
            method: "POST",
            body: `data=${encodeURIComponent(ql)}`,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeoutMs: ((query.timeoutSec ?? 90) + 15) * 1000,
            retries: 2,
            backoffMs: 5_000,
            cacheDir: opts.cacheDir,
            fetchImpl: opts.fetchImpl,
            sleep: opts.sleep,
          });
          return {
            places: parseOverpass(res.data),
            latencyMs: res.latencyMs,
            endpoint,
            fromCache: res.fromCache,
            isMock: false,
          };
        } catch (err) {
          errors.push(`${new URL(endpoint).host}: ${(err as Error).message}`);
        }
      }
      throw new Error(`Overpass failed on all endpoints (${errors.join("; ")})`);
    },
  };
}
