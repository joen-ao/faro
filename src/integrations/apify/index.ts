import { getEnv, resolveMode, type Env } from "@/lib/env";
import { createMockApify } from "./mock";
import { createRealApify, DEFAULT_CONTACT_ACTOR_ID } from "./real";
import type { ApifyAdapter } from "./types";

export * from "./types";
export { assertScrapableUrl, isGoogleMapsUrl } from "./guard";
export { createRealApify, buildActorInput, toContactItem, DEFAULT_CONTACT_ACTOR_ID } from "./real";
export { createMockApify } from "./mock";

/** Real only with `APIFY_MODE=real`, `APIFY_TOKEN` (actor = `APIFY_CONTACT_ACTOR_ID` or the Contact Details Scraper); otherwise the mock. */
export function getApify(env: Env = getEnv(), fetchImpl?: typeof fetch): ApifyAdapter {
  if (resolveMode("apify", env) === "mock" || !env.APIFY_TOKEN) return createMockApify();
  return createRealApify({ token: env.APIFY_TOKEN, actorId: env.APIFY_CONTACT_ACTOR_ID || DEFAULT_CONTACT_ACTOR_ID, fetchImpl });
}
