import type { SourceCompany } from "@/integrations/types";

/** Accepts the shared `SourceCompany` and the narrower Overpass one (no NIT / legal-entity flags). */
export type DedupeInput = Omit<SourceCompany, "isLegalEntity" | "possibleNaturalPerson" | "raw" | "nit"> &
  Partial<Pick<SourceCompany, "isLegalEntity" | "possibleNaturalPerson" | "nit">> & { raw: Record<string, unknown> };

import { domainOf, isGenericOnly, haversineMeters, normalizeName, normalizePhoneE164, trigramSimilarity } from "./normalize";

export const NAME_SIMILARITY_THRESHOLD = 0.6;
export const MAX_DISTANCE_METERS = 80;

export type MatchReason = "nit" | "name+distance" | "name+domain" | "name+phone";

/** Official registries win over crowd-sourced data when choosing name/address. */
export const SOURCE_PRIORITY: Record<string, number> = { rues: 3, reps: 3, google_places: 2, website: 1, osm: 1 };
export const priorityOf = (channel: string): number => SOURCE_PRIORITY[channel] ?? 0;

/** In-memory working record: one per (existing or new) company during a dedupe run. */
export interface Entity {
  id: string;
  isNew: boolean;
  dirty: boolean;
  isDemo: boolean;
  name: string;
  normalizedName: string;
  /** Name made only of generic sector words: distance alone is not enough to merge. */
  genericOnly?: boolean;
  nit?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  website?: string;
  isLegalEntity: boolean;
  priority: number;
  domains: Set<string>;
  phones: Set<string>;
}

export interface Match {
  entity: Entity;
  reason: MatchReason;
  similarity: number;
  distanceMeters?: number;
}

export function normalizeNit(nit: string | undefined): string | undefined {
  // "900123456-7": drop the check digit after the hyphen
  const digits = nit?.split("-")[0].replace(/\D/g, "").replace(/^0+/, "");
  return digits && digits.length >= 5 ? digits : undefined;
}

export interface Probe {
  company: DedupeInput;
  normalizedName: string;
  genericOnly: boolean;
  nit?: string;
  domain?: string;
  phone?: string;
}

export function probeOf(company: DedupeInput, generic?: readonly string[]): Probe {
  return {
    company,
    normalizedName: normalizeName(company.name, generic),
    genericOnly: isGenericOnly(company.name, generic),
    nit: normalizeNit(company.nit),
    domain: domainOf(company.website),
    phone: normalizePhoneE164(company.phone),
  };
}

/**
 * Applies the F07 rules to one candidate (NIT is resolved by the caller via a map).
 * Returns the best reason found, or undefined when it must NOT merge.
 */
export function compareByName(probe: Probe, e: Entity): Match | undefined {
  if (probe.nit && e.nit && probe.nit !== e.nit) return undefined; // different legal entities
  const similarity = trigramSimilarity(probe.normalizedName, e.normalizedName);
  if (similarity < NAME_SIMILARITY_THRESHOLD) return undefined;
  const { lat, lng } = probe.company;
  if (!probe.genericOnly && !e.genericOnly && lat !== undefined && lng !== undefined && e.lat !== undefined && e.lng !== undefined) {
    const d = haversineMeters(lat, lng, e.lat, e.lng);
    if (d <= MAX_DISTANCE_METERS) return { entity: e, reason: "name+distance", similarity, distanceMeters: d };
  }
  if (probe.domain && e.domains.has(probe.domain)) return { entity: e, reason: "name+domain", similarity };
  if (probe.phone && e.phones.has(probe.phone)) return { entity: e, reason: "name+phone", similarity };
  return undefined;
}

/**
 * Spatial grid with fixed 0.0015-degree cells (~167 m N-S; E-W width stays >= 80 m up to ~61 degrees latitude):
 * a 3x3 neighbourhood always covers the 80 m match radius, so only neighbours are compared by distance.
 */
export class GridIndex {
  private cells = new Map<string, Entity[]>();
  private readonly step = 0.0015;

  private key(lat: number, lng: number): [number, number] {
    return [Math.floor(lat / this.step), Math.floor(lng / this.step)];
  }
  add(e: Entity) {
    if (e.lat === undefined || e.lng === undefined) return;
    const [a, b] = this.key(e.lat, e.lng);
    const k = `${a}:${b}`;
    const list = this.cells.get(k);
    if (list) list.push(e);
    else this.cells.set(k, [e]);
  }
  near(lat: number, lng: number): Entity[] {
    const [a, b] = this.key(lat, lng);
    const out: Entity[] = [];
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = this.cells.get(`${a + i}:${b + j}`);
        if (list) out.push(...list);
      }
    }
    return out;
  }
}
