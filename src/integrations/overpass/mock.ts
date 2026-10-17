import { readFileSync } from "node:fs";
import path from "node:path";
import { parseOverpass } from "./real";
import type { OverpassAdapter, OverpassResult } from "./types";

/** Mock adapter: returns the small real sample stored in fixtures/, flagged `isMock`. */
export function createMockOverpass(fixture = path.join(process.cwd(), "fixtures", "overpass-dental-bogota.json")): OverpassAdapter {
  return {
    async search(): Promise<OverpassResult> {
      const json = JSON.parse(readFileSync(fixture, "utf8")) as { elements?: never[] };
      return { places: parseOverpass(json), latencyMs: 0, endpoint: "mock", fromCache: false, isMock: true };
    },
  };
}
