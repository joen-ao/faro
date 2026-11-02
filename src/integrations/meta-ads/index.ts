import { getEnv, type Env } from "@/lib/env";
import { createMockMetaAds } from "./mock";
import { createRealMetaAds } from "./real";
import type { MetaAdsAdapter, MetaApiCallLogger } from "./types";

export * from "./types";
export { createMockMetaAds } from "./mock";
export { createRealMetaAds, redactToken, withUtm } from "./real";

/** Whether real Meta credentials are configured (token + ad account + page). */
export function metaAdsConfigured(env: Env = getEnv()): boolean {
  return !!env.META_ACCESS_TOKEN && !!env.META_AD_ACCOUNT_ID && !!env.META_PAGE_ID;
}

/** `META_ADS_MODE=real` + full credentials -> real; anything else -> mock. */
export function getMetaAds(env: Env = getEnv(), onApiCall?: MetaApiCallLogger, fetchImpl?: typeof fetch): MetaAdsAdapter {
  if (env.META_ADS_MODE !== "real" || !metaAdsConfigured(env)) return createMockMetaAds();
  return createRealMetaAds({
    token: env.META_ACCESS_TOKEN!,
    adAccountId: env.META_AD_ACCOUNT_ID!,
    pageId: env.META_PAGE_ID!,
    apiVersion: env.META_API_VERSION,
    onApiCall,
    fetchImpl,
  });
}
