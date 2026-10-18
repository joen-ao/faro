import type { PointStatus, StreamPoint } from "./types";

export interface PointFeature {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { id: string; name: string; status: PointStatus; source: string; score: number | null; approx: boolean };
}

export interface PointCollection {
  type: "FeatureCollection";
  features: PointFeature[];
}

export const hasLocation = (p: StreamPoint): p is StreamPoint & { lat: number; lng: number } =>
  typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** Points with coordinates -> GeoJSON for the single map layer (no DOM markers). */
export function toFeatureCollection(points: Iterable<StreamPoint>): PointCollection {
  const features: PointFeature[] = [];
  for (const p of points) {
    // Exact coordinates when the source has them; otherwise the approximate spot in its city (drawn faded).
    const at = hasLocation(p) ? { lat: p.lat, lng: p.lng } : p.approx;
    if (!at) continue;
    features.push({
      type: "Feature",
      id: p.id,
      geometry: { type: "Point", coordinates: [at.lng, at.lat] },
      properties: { id: p.id, name: p.name, status: p.status, source: p.source, score: p.score, approx: !hasLocation(p) },
    });
  }
  return { type: "FeatureCollection", features };
}

/** [west, south, east, north] of the located points, or null when there are none. */
export function boundsOf(points: Iterable<StreamPoint>): [number, number, number, number] | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of points) {
    if (!hasLocation(p)) continue;
    if (p.lng < w) w = p.lng;
    if (p.lng > e) e = p.lng;
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
  }
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/** [west, south, east, north] covering every city bbox ([south, west, north, east] each), or null when none has one. */
export function areaBounds(cities: ReadonlyArray<{ bbox?: readonly [number, number, number, number] }>): [number, number, number, number] | null {
  const boxes = cities.flatMap((c) => (c.bbox ? [c.bbox] : []));
  if (!boxes.length) return null;
  return [Math.min(...boxes.map((b) => b[1])), Math.min(...boxes.map((b) => b[0])), Math.max(...boxes.map((b) => b[3])), Math.max(...boxes.map((b) => b[2]))];
}

/** Smallest box containing both (either may be null). */
export function unionBounds(a: [number, number, number, number] | null, b: [number, number, number, number] | null): [number, number, number, number] | null {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}
