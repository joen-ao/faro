import type { Env } from "@/lib/env";
import { buildCsv } from "./csv";
import type { DaptaQualifierAdapter } from "./types";

/** Used when http_push has no credentials. Never touches the network; results are flagged mock. */
export function createMockDaptaAdapter(env: Pick<Env, "DAPTA_MODE">): DaptaQualifierAdapter {
  return {
    mode: env.DAPTA_MODE,
    isMock: true,
    exportCsv: (leads) => buildCsv(leads),
    async push(leads) {
      return { status: "simulated", count: leads.length, reason: "mock: no Dapta credentials", isMock: true };
    },
  };
}
