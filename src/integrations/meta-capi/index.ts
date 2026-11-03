import { getEnv, type Env } from "@/lib/env";
import { createMockCapi } from "./mock";
import { createRealCapi, type RealCapiOptions } from "./real";
import type { CapiAdapter } from "./types";

export * from "./types";
export { createMockCapi } from "./mock";
export { createRealCapi } from "./real";

/** Real only with a pixel id, the system-user token and META_ADS_MODE=real; otherwise mock (sends nothing). */
export function getCapi(env: Env = getEnv(), onCall?: RealCapiOptions["onCall"]): CapiAdapter {
  if (!env.META_PIXEL_ID || !env.META_ACCESS_TOKEN || env.META_ADS_MODE !== "real") return createMockCapi();
  return createRealCapi({ pixelId: env.META_PIXEL_ID, token: env.META_ACCESS_TOKEN, apiVersion: env.META_API_VERSION, testEventCode: env.META_CAPI_TEST_CODE, onCall });
}
