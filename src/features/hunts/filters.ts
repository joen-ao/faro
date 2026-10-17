import type { PointStatus, StreamPoint } from "./types";

export interface LeadFilter {
  /** Free text over the name (accent/case insensitive). */
  query: string;
  /** Empty set = all. */
  sources: ReadonlySet<string>;
  /** Empty set = all. */
  statuses: ReadonlySet<PointStatus>;
  /** Only points that have coordinates on the map. */
  onlyLocated: boolean;
}

export const NO_FILTER: LeadFilter = { query: "", sources: new Set(), statuses: new Set(), onlyLocated: false };

export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const RANK: Record<PointStatus, number> = { qualified: 0, contacted: 1, fit: 2, found: 3 };

export function filterPoints(points: readonly StreamPoint[], f: LeadFilter): StreamPoint[] {
  const q = fold(f.query.trim());
  return points.filter((p) => {
    if (f.sources.size && !f.sources.has(p.source)) return false;
    if (f.statuses.size && !f.statuses.has(p.status)) return false;
    if (f.onlyLocated && (p.lat == null || p.lng == null)) return false;
    return !q || fold(p.name).includes(q);
  });
}

/** List order: most advanced status first, then score, then name. Stable and cheap for 2.000 rows. */
export function sortForList(points: readonly StreamPoint[]): StreamPoint[] {
  return [...points].sort(
    (a, b) => RANK[a.status] - RANK[b.status] || (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name, "es"),
  );
}
