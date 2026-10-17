import { getEnv, type Env } from "@/lib/env";
import { createMockDaptaAdapter } from "./mock";
import { createRealDaptaAdapter, type RealDeps } from "./real";
import type { DaptaQualifierAdapter } from "./types";

/** http_push without URL+key falls back to the mock; the other modes need no credentials. */
export function getDaptaAdapter(env: Env = getEnv(), deps?: RealDeps): DaptaQualifierAdapter {
  if (env.DAPTA_MODE === "http_push" && !(env.DAPTA_PUSH_URL && env.DAPTA_PUSH_API_KEY)) return createMockDaptaAdapter(env);
  return createRealDaptaAdapter(env, deps);
}

export * from "./types";
export { buildCsv, csvCell } from "./csv";
export { assertSafePushUrl, assertSafePushUrlResolved, UnsafeUrlError } from "./ssrf";
