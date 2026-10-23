import type { IcpCriteria } from "@/features/icp/schema";
import { getOverpass, queryFromCriteria, type OverpassAdapter } from "@/integrations/overpass";
import {
  REPS_DATASET,
  REPS_FIELDS,
  RUES_DATASET,
  RUES_FIELDS,
  getSocrata,
  repsToSource,
  repsWhere,
  repsByIdsWhere,
  ruesToSource,
  ruesWhere,
  HEALTH_SERVICE_KEYWORDS,
  REGISTRY_DATASET,
  RNT_FIELDS,
  SECOP_FIELDS,
  SOLIDARIA_FIELDS,
  registryToSource,
  registryWhere,
  type RegistrySource,
  type SocrataAdapter,
} from "@/integrations/socrata";
import type { SourceCompany } from "@/integrations/types";
import type { SourceCompany as OsmCompany } from "@/integrations/overpass/types";
import { screenOsmCompanies } from "@/features/compliance/person-name";
import { findCity, findSector } from "@/features/icp/presets";
import { BATCH_SIZE, planSources, sliceBatch } from "./batch";
import { sectorNameKeywords } from "./keywords";
import type { HuntSource } from "./types";

export interface SourceDeps {
  overpass: OverpassAdapter;
  socrata: SocrataAdapter;
}

export function defaultSourceDeps(): SourceDeps {
  return { overpass: getOverpass(), socrata: getSocrata() };
}

export type FetchedCompany = SourceCompany | OsmCompany;

export interface FetchedBatch {
  companies: FetchedCompany[];
  /** Offset to send as `cursor` next time. */
  nextCursor: number;
  done: boolean;
  total: number | null;
  isMock: boolean;
  /** Rows dropped by compliance filters (natural persons, look-alikes). Counts only. */
  excluded: number;
}

const accentless = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** OSM results by hunt, kept in memory between batches (the adapter also caches to disk). */
const osmMemo = new Map<string, { at: number; list: OsmCompany[]; isMock: boolean; excluded: number }>();
const MEMO_TTL_MS = 10 * 60_000;

async function osmList(key: string, c: IcpCriteria, overpass: OverpassAdapter) {
  const hit = osmMemo.get(key);
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit;
  const res = await overpass.search(
    queryFromCriteria({
      tags: c.osmTags,
      bbox: c.bbox ? { south: c.bbox[0], west: c.bbox[1], north: c.bbox[2], east: c.bbox[3] } : undefined,
      city: c.city,
      country: c.country,
    }),
  );
  // Stable order so a cursor means the same thing on every call.
  // SPEC §8: OSM has no legal nature; names are screened by category (see compliance/person-name).
  const extraWords = findSector(c.sector)?.keywords ?? [];
  const { kept, excluded } = screenOsmCompanies(res.companies, extraWords);
  const list = [...kept].sort((a, b) => a.externalId.localeCompare(b.externalId));
  const entry = { at: Date.now(), list, isMock: res.isMock, excluded };
  osmMemo.set(key, entry);
  if (osmMemo.size > 20) osmMemo.delete(osmMemo.keys().next().value as string);
  return entry;
}

/**
 * One batch of a source. OSM: the whole (cached) list is sliced by offset. RUES/REPS: native Socrata
 * paging (`$limit/$offset`, ordered by `:id`) so no request ever downloads the full dataset.
 */
/** Max registry rows (RUES/REPS) read per city: keeps every hunt to a few minutes. */
export const REGISTRY_MAX_PER_CITY = 3000;

export async function fetchBatch(
  huntId: string,
  source: HuntSource,
  c: IcpCriteria,
  cursor: number,
  deps: SourceDeps,
  size = BATCH_SIZE,
  /** Index of the city inside a multi-city hunt (`c` is already restricted to that city). */
  cityIndex = 0,
): Promise<FetchedBatch> {
  if (source === "osm") {
    const { list, isMock, excluded } = await osmList(cityIndex ? `${huntId}:osm:${cityIndex}` : `${huntId}:osm`, c, deps.overpass);
    const s = sliceBatch(list, cursor, size);
    // The excluded count is reported once, with the first batch.
    return { companies: s.items, nextCursor: s.nextCursor, done: s.done, total: list.length, isMock, excluded: cursor === 0 ? excluded : 0 };
  }
  if (source === "secop" || source === "rnt" || source === "solidaria") return fetchRegistryBatch(source, c, cursor, deps, size);
  const isRues = source === "rues";
  // Some sectors have tens of thousands of RUES rows (lawyers in Bogotá): cap each city so a hunt always finishes.
  if (cursor >= REGISTRY_MAX_PER_CITY) return { companies: [], nextCursor: cursor, done: true, total: null, isMock: false, excluded: 0 };
  const dataset = isRues ? RUES_DATASET : REPS_DATASET;
  // Preset cities carry the verified RUES chamber and the DANE code for REPS; others fall back to the name.
  // (Bogotá: the code returns exactly the rows the old name filter did, so older hunts resume at the same cursor.)
  const preset = findCity(c.city);
  const includeNatural = c.includeIndependents === true;
  const where = isRues
    ? ruesWhere({ ciiu: c.ciiu, camara: preset?.camara ?? accentless(c.city), includeNatural })
    : repsWhere({ municipio: accentless(c.city), municipioCode: preset?.dane, nameKeywords: HEALTH_SERVICE_KEYWORDS.dental, includeIndependents: includeNatural });
  const page = await deps.socrata.query(dataset, { select: isRues ? RUES_FIELDS : REPS_FIELDS, where, order: ":id", limit: size, offset: cursor, keepPersonal: includeNatural });
  const converted = isRues ? ruesToSource(page.rows, page.isMock, { includeNatural }) : repsToSource(page.rows, page.isMock, { includeNatural });
  const total = cursor === 0 ? (await deps.socrata.count(dataset, where)).count : null;
  const nextCursor = cursor + page.rows.length;
  // Health hunts: the RUES NIT / ID is the same number REPS uses, so the batch's REPS records bring their registered
  // mailbox and phone (companies whose name says nothing about the sector and independents registered under their name).
  let joined: FetchedCompany[] = [];
  if (isRues && planSources(c).reps.applicable) {
    const ids = converted.companies.map((x) => x.nit).filter((x): x is string => !!x);
    if (ids.length) {
      const reps = await deps.socrata
        .query(REPS_DATASET, { select: REPS_FIELDS, where: repsByIdsWhere(ids), order: ":id", limit: 1000, keepPersonal: includeNatural })
        .catch(() => null);
      if (reps) joined = repsToSource(reps.rows, reps.isMock, { includeNatural }).companies;
    }
  }
  return {
    companies: [...converted.companies, ...joined],
    nextCursor,
    done: page.rows.length < size || nextCursor >= REGISTRY_MAX_PER_CITY,
    total,
    isMock: page.isMock,
    excluded: converted.excluded.naturalPerson + converted.excluded.lookalike,
  };
}

const REGISTRY_FIELDS: Record<RegistrySource, string> = { secop: SECOP_FIELDS, rnt: RNT_FIELDS, solidaria: SOLIDARIA_FIELDS };

/** SECOP II / RNT / Supersolidaria: city + sector words, native Socrata paging, capped per city like RUES. */
async function fetchRegistryBatch(source: RegistrySource, c: IcpCriteria, cursor: number, deps: SourceDeps, size: number): Promise<FetchedBatch> {
  if (cursor >= REGISTRY_MAX_PER_CITY) return { companies: [], nextCursor: cursor, done: true, total: null, isMock: false, excluded: 0 };
  const keywords = sectorNameKeywords(c);
  const dataset = REGISTRY_DATASET[source];
  const preset = findCity(c.city);
  const includeNatural = c.includeIndependents === true;
  const where = registryWhere(source, { city: c.city, dane: preset?.dane, keywords, includeNatural });
  // Supersolidaria has one row per entity and month: grouped by NIT so each entity is read once.
  const grouped = source === "solidaria";
  const page = await deps.socrata.query(dataset, {
    select: REGISTRY_FIELDS[source],
    where,
    ...(grouped ? { group: "nit", order: "nit" } : { order: ":id" }),
    limit: size,
    offset: cursor,
    keepPersonal: includeNatural,
  });
  const converted = registryToSource(source, page.rows, { city: preset?.city ?? c.city, keywords, includeNatural }, page.isMock);
  let total: number | null = null;
  if (cursor === 0) {
    if (grouped) {
      const r = await deps.socrata.query(dataset, { select: "count(distinct nit) as n", where, limit: 1 });
      total = Number(r.rows[0]?.n ?? 0) || null;
    } else total = (await deps.socrata.count(dataset, where)).count;
  }
  const nextCursor = cursor + page.rows.length;
  return {
    companies: converted.companies,
    nextCursor,
    done: page.rows.length < size || nextCursor >= REGISTRY_MAX_PER_CITY,
    total,
    isMock: page.isMock,
    excluded: converted.excluded,
  };
}
