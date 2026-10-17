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
  ruesToSource,
  ruesWhere,
  HEALTH_SERVICE_KEYWORDS,
  type SocrataAdapter,
} from "@/integrations/socrata";
import type { SourceCompany } from "@/integrations/types";
import type { SourceCompany as OsmCompany } from "@/integrations/overpass/types";
import { BATCH_SIZE, sliceBatch } from "./batch";
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
const osmMemo = new Map<string, { at: number; list: OsmCompany[]; isMock: boolean }>();
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
  const list = [...res.companies].sort((a, b) => a.externalId.localeCompare(b.externalId));
  const entry = { at: Date.now(), list, isMock: res.isMock };
  osmMemo.set(key, entry);
  if (osmMemo.size > 20) osmMemo.delete(osmMemo.keys().next().value as string);
  return entry;
}

/**
 * One batch of a source. OSM: the whole (cached) list is sliced by offset. RUES/REPS: native Socrata
 * paging (`$limit/$offset`, ordered by `:id`) so no request ever downloads the full dataset.
 */
export async function fetchBatch(
  huntId: string,
  source: HuntSource,
  c: IcpCriteria,
  cursor: number,
  deps: SourceDeps,
  size = BATCH_SIZE,
): Promise<FetchedBatch> {
  if (source === "osm") {
    const { list, isMock } = await osmList(`${huntId}:osm`, c, deps.overpass);
    const s = sliceBatch(list, cursor, size);
    return { companies: s.items, nextCursor: s.nextCursor, done: s.done, total: list.length, isMock, excluded: 0 };
  }
  const isRues = source === "rues";
  const dataset = isRues ? RUES_DATASET : REPS_DATASET;
  const where = isRues
    ? ruesWhere({ ciiu: c.ciiu, camara: accentless(c.city) })
    : repsWhere({ municipio: accentless(c.city), nameKeywords: HEALTH_SERVICE_KEYWORDS.dental });
  const page = await deps.socrata.query(dataset, { select: isRues ? RUES_FIELDS : REPS_FIELDS, where, order: ":id", limit: size, offset: cursor });
  const converted = isRues ? ruesToSource(page.rows, page.isMock) : repsToSource(page.rows, page.isMock);
  const total = cursor === 0 ? (await deps.socrata.count(dataset, where)).count : null;
  const nextCursor = cursor + page.rows.length;
  return {
    companies: converted.companies,
    nextCursor,
    done: page.rows.length < size,
    total,
    isMock: page.isMock,
    excluded: converted.excluded.naturalPerson + converted.excluded.lookalike,
  };
}
