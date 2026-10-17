import type { PointStatus, StreamPoint } from "./types";

export interface PointFeature {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { id: string; name: string; status: PointStatus; source: string; score: number | null };
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
    if (!hasLocation(p)) continue;
    features.push({
      type: "Feature",
      id: p.id,
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { id: p.id, name: p.name, status: p.status, source: p.source, score: p.score },
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
