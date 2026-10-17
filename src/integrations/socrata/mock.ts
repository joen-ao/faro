import { readFileSync } from "node:fs";
import path from "node:path";
import type { SocrataAdapter, SocrataResult, SocrataRow } from "./types";

/** Mock adapter: serves rows from a small real sample in fixtures/, flagged `isMock`. */
export function createMockSocrata(dir = path.join(process.cwd(), "fixtures")): SocrataAdapter {
  const load = (dataset: string): SocrataRow[] => {
    const file = dataset === "c36g-9fc2" ? "socrata-reps-sample.json" : "socrata-rues-sample.json";
    return (JSON.parse(readFileSync(path.join(dir, file), "utf8")) as { rows: SocrataRow[] }).rows;
  };
  const result = (rows: SocrataRow[]): SocrataResult => ({ rows, latencyMs: 0, fromCache: false, isMock: true });
  return {
    async query(dataset, q) {
      return result(load(dataset).slice(0, q.limit ?? 1000));
    },
    async count(dataset) {
      return { count: load(dataset).length, latencyMs: 0 };
    },
    async queryAll(dataset) {
      return result(load(dataset));
    },
  };
}
