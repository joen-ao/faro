import { getEnv, type Env } from "@/lib/env";
import { createMockWebsiteFetch } from "./mock";
import { createRealWebsiteFetch, type RealWebsiteFetchDeps } from "./real";
import type { WebsiteFetchAdapter } from "./types";

export * from "./types";
export { createRealWebsiteFetch, userAgent } from "./real";
export { createMockWebsiteFetch } from "./mock";
export { extractPage, mergeExtractions } from "./extract";
export { parseRobots, isPathAllowed } from "./robots";

/**
 * Direct fetch needs no credentials, so it is real by default; `WEBSITE_FETCH_MODE=mock` (read from
 * process.env, no env schema change) forces the mock. Demo companies always use the mock (see enrich).
 */
export function getWebsiteFetch(env: Env = getEnv(), deps: RealWebsiteFetchDeps = {}, mode = process.env.WEBSITE_FETCH_MODE): WebsiteFetchAdapter {
  if (mode === "mock") return createMockWebsiteFetch();
  return createRealWebsiteFetch({ appUrl: env.NEXT_PUBLIC_APP_URL, ...deps });
}
