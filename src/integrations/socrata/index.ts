import { getEnv, resolveMode, type Env } from "@/lib/env";
import { createMockSocrata } from "./mock";
import { createRealSocrata } from "./real";
import type { SocrataAdapter } from "./types";

export * from "./types";
export * from "./datasets";
export { buildSocrataUrl } from "./real";

export function getSocrata(env: Env = getEnv()): SocrataAdapter {
  if (resolveMode("socrata", env) === "mock") return createMockSocrata();
  return createRealSocrata({ appToken: env.SOCRATA_APP_TOKEN, cacheDir: ".cache/socrata" });
}
