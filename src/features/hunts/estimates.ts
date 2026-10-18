import { findCity, findSector, huntCities } from "@/features/icp/presets";
import type { IcpCriteria } from "@/features/icp/schema";
import { planSources } from "./batch";
import type { HuntSource } from "./types";

export interface SourceEstimate {
  source: HuntSource;
  applicable: boolean;
  reason?: string;
  /** null = no measured reference for this ICP (for a multi-city hunt: for at least one of its cities). */
  estimate: number | null;
  basis: string;
}

/**
 * Reference counts measured live, never presented as results:
 * - Bogotá / Miami: F02 coverage test (`reports/coverage.md`, 17 Oct 2026).
 * - Medellín, Cali, Barranquilla, Cartagena: `count(*)` on datos.gov.co with the exact RUES/REPS filters the hunt
 *   uses (18 Oct 2026; the same query reproduced Bogotá's F02 numbers). OSM was not measured there: no estimate.
 */
const REFERENCE: Record<string, Partial<Record<HuntSource, number>>> = {
  "dental|bogota": { osm: 436, rues: 1445, reps: 241 },
  "restaurant|bogota": { osm: 4634, rues: 7359 },
  "restaurant|miami": { osm: 704 },
  "dental|medellin": { rues: 362, reps: 82 },
  "restaurant|medellin": { rues: 1968 },
  "dental|cali": { rues: 384, reps: 86 },
  "restaurant|cali": { rues: 1726 },
  "dental|barranquilla": { rues: 314, reps: 42 },
  "restaurant|barranquilla": { rues: 1439 },
  "dental|cartagena": { rues: 161, reps: 34 },
  "restaurant|cartagena": { rues: 1237 },
};

/** Per source: the sum over the hunt cities, or null as soon as one city has no measured reference (never guessed). */
export function estimateSources(c: IcpCriteria): SourceEstimate[] {
  const plan = planSources(c);
  const sector = findSector(c.sector)?.sector ?? c.sector;
  const refs = huntCities(c).map((x) => REFERENCE[`${sector}|${findCity(x.name)?.keywords[0] ?? x.name.toLowerCase()}`]);
  return (["osm", "rues", "reps"] as const).map((source) => {
    const values = refs.map((r) => r?.[source]);
    const known = values.every((v): v is number => v != null);
    const estimate = plan[source].applicable && known ? values.reduce((a, v) => a + v, 0) : null;
    return {
      source,
      applicable: plan[source].applicable,
      reason: plan[source].reason,
      estimate,
      basis: known ? (refs.length > 1 ? `Suma de ${refs.length} ciudades medidas` : "Conteo medido (F02 / datos.gov.co)") : "Sin referencia medida",
    };
  });
}
