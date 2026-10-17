import { readFileSync } from "node:fs";
import path from "node:path";
import { parseOverpass, toSourceCompanies } from "./real";
import type { OverpassAdapter, OverpassQuery, OverpassResult } from "./types";

/** Mock adapter: returns the small real sample stored in fixtures/, flagged `isMock` (never counted as real). */
export function createMockOverpass(fixture = path.join(process.cwd(), "fixtures", "overpass-dental-bogota.json")): OverpassAdapter {
  return {
    async search(query?: OverpassQuery): Promise<OverpassResult> {
      const json = JSON.parse(readFileSync(fixture, "utf8")) as { elements?: never[] };
      const places = parseOverpass(json);
      return {
        places,
        companies: toSourceCompanies(places, { city: query?.city ?? "Bogotá", country: query?.country, isMock: true }),
        latencyMs: 0,
        endpoint: "mock",
        fromCache: false,
        isMock: true,
      };
    },
  };
}
