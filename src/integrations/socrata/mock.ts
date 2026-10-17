import { readFileSync } from "node:fs";
import path from "node:path";
import { REPS_DATASET } from "./datasets";
import type { SocrataAdapter, SocrataResult, SocrataRow } from "./types";

/** Mock adapter: serves rows from a small real sample in fixtures/, flagged `isMock`. Ignores $where. */
export function createMockSocrata(dir = path.join(process.cwd(), "fixtures")): SocrataAdapter {
  const load = (dataset: string): SocrataRow[] => {
    const file = dataset === REPS_DATASET ? "socrata-reps-sample.json" : "socrata-rues-sample.json";
    return (JSON.parse(readFileSync(path.join(dir, file), "utf8")) as { rows: SocrataRow[] }).rows;
  };
  const result = (rows: SocrataRow[]): SocrataResult => ({ rows, latencyMs: 0, fromCache: false, isMock: true });
  return {
    async query(dataset, q) {
      const start = Math.max(q.offset ?? 0, 0);
      return result(load(dataset).slice(start, start + (q.limit ?? 1000)));
    },
    async count(dataset) {
      return { count: load(dataset).length, latencyMs: 0 };
    },
    async queryAll(dataset, _q, o) {
      return result(load(dataset).slice(0, o?.maxRows ?? Infinity));
    },
  };
}
