import { getEnv, resolveMode, type Env } from "@/lib/env";
import { createMockOverpass } from "./mock";
import { createRealOverpass, OVERPASS_ENDPOINTS } from "./real";
import type { ApiCallLogger, OverpassAdapter } from "./types";

export * from "./types";
export { normalizePhone } from "./phone";
export { persistOverpassResults } from "./persist";
export { buildOverpassQuery, parseOverpass, parseTagFilters, queryFromCriteria, toSourceCompanies } from "./real";

/** Picks the adapter from `OVERPASS_MODE`. Pass `onApiCall` to log each real request to `api_calls`. */
export function getOverpass(env: Env = getEnv(), onApiCall?: ApiCallLogger): OverpassAdapter {
  if (resolveMode("overpass", env) === "mock") return createMockOverpass();
  const endpoints = [env.OVERPASS_URL, ...OVERPASS_ENDPOINTS.filter((e) => e !== env.OVERPASS_URL)];
  return createRealOverpass({ endpoints, cacheDir: ".cache/overpass", onApiCall });
}
