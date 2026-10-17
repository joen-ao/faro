import { findCity, findSector } from "@/features/icp/presets";
import type { IcpCriteria } from "@/features/icp/schema";
import { planSources } from "./batch";
import type { HuntSource } from "./types";

export interface SourceEstimate {
  source: HuntSource;
  applicable: boolean;
  reason?: string;
  /** null = no measured reference for this ICP. */
  estimate: number | null;
  basis: string;
}

/**
 * Reference counts measured live in the F02 coverage test (`reports/coverage.md`, 17 Oct 2026).
 * They are estimates for the search preview, never presented as results.
 */
const REFERENCE: Record<string, Partial<Record<HuntSource, number>>> = {
  "dental|bogota": { osm: 436, rues: 1445, reps: 241 },
  "restaurant|bogota": { osm: 4634, rues: 7359 },
  "restaurant|miami": { osm: 704 },
};

export function estimateSources(c: IcpCriteria): SourceEstimate[] {
  const plan = planSources(c);
  const sector = findSector(c.sector)?.sector ?? c.sector;
  const city = findCity(c.city)?.keywords[0] ?? c.city.toLowerCase();
  const ref = REFERENCE[`${sector}|${city}`];
  return (["osm", "rues", "reps"] as const).map((source) => ({
    source,
    applicable: plan[source].applicable,
    reason: plan[source].reason,
    estimate: plan[source].applicable ? (ref?.[source] ?? null) : null,
    basis: ref?.[source] != null ? "Prueba de cobertura (F02)" : "Sin referencia medida",
  }));
}
