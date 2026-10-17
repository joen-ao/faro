import { getEnv, resolveMode, type Env } from "@/lib/env";
import { createMockApify } from "./mock";
import { createRealApify } from "./real";
import type { ApifyAdapter } from "./types";

export * from "./types";
export { assertScrapableUrl, isGoogleMapsUrl } from "./guard";
export { createRealApify, buildActorInput, toContactItem } from "./real";
export { createMockApify } from "./mock";

/** Real only with `APIFY_MODE=real`, `APIFY_TOKEN` and `APIFY_CONTACT_ACTOR_ID`; otherwise the mock. */
export function getApify(env: Env = getEnv(), fetchImpl?: typeof fetch): ApifyAdapter {
  if (resolveMode("apify", env) === "mock" || !env.APIFY_CONTACT_ACTOR_ID || !env.APIFY_TOKEN) return createMockApify();
  return createRealApify({ token: env.APIFY_TOKEN, actorId: env.APIFY_CONTACT_ACTOR_ID, fetchImpl });
}
