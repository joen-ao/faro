import { getEnv, resolveMode, type Env } from "@/lib/env";
import { createMockSocrata } from "./mock";
import { createRealSocrata } from "./real";
import { createSocrataSource } from "./search";
import type { ApiCallLogger, SocrataAdapter, SocrataSource } from "./types";

export * from "./types";
export * from "./datasets";
export { buildSocrataUrl, createRealSocrata, redactRow, REDACTED } from "./real";
export { createSocrataSource, genericEmailOnly, repsToSource, ruesToSource } from "./search";
export { createMockSocrata } from "./mock";

/** Low-level adapter chosen by `SOCRATA_MODE` (mock rows are flagged `isMock`). */
export function getSocrata(env: Env = getEnv(), onCall?: ApiCallLogger): SocrataAdapter {
  if (resolveMode("socrata", env) === "mock") return createMockSocrata();
  return createRealSocrata({ appToken: env.SOCRATA_APP_TOKEN, onCall });
}

/** High-level legal-entity-only search (RUES by CIIU/cámara, REPS health plugin). */
export function getSocrataSource(env: Env = getEnv(), onCall?: ApiCallLogger): SocrataSource {
  return createSocrataSource(getSocrata(env, onCall), {
    ruesDataset: env.SOCRATA_RUES_DATASET,
    repsDataset: env.SOCRATA_REPS_DATASET,
  });
}
