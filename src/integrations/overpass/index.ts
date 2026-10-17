import { getEnv, resolveMode, type Env } from "@/lib/env";
import { createMockOverpass } from "./mock";
import { createRealOverpass, OVERPASS_ENDPOINTS } from "./real";
import type { OverpassAdapter } from "./types";

export * from "./types";
export { buildOverpassQuery, parseOverpass } from "./real";

export function getOverpass(env: Env = getEnv()): OverpassAdapter {
  if (resolveMode("overpass", env) === "mock") return createMockOverpass();
  const endpoints = [env.OVERPASS_URL, ...OVERPASS_ENDPOINTS.filter((e) => e !== env.OVERPASS_URL)];
  return createRealOverpass({ endpoints, cacheDir: ".cache/overpass" });
}
