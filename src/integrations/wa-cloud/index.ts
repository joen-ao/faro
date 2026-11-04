import { getEnv, type Env } from "@/lib/env";
import { createMockWaCloud } from "./mock";
import { createRealWaCloud } from "./real";
import type { WaCloudAdapter } from "./types";

type WaEnv = Pick<Env, "WA_AGENT_MODE" | "WA_PHONE_NUMBER_ID" | "WA_ACCESS_TOKEN" | "WA_APP_SECRET" | "WA_GRAPH_VERSION"> & Partial<Pick<Env, "WA_BUSINESS_ACCOUNT_ID">>;

/** Real only when requested and every credential is present; otherwise mock (nothing is sent). */
export function waCloudIsReal(env: WaEnv = getEnv()): boolean {
  return env.WA_AGENT_MODE === "real" && !!env.WA_PHONE_NUMBER_ID && !!env.WA_ACCESS_TOKEN && !!env.WA_APP_SECRET;
}

export function getWaCloud(env: WaEnv = getEnv()): WaCloudAdapter {
  if (!waCloudIsReal(env)) return createMockWaCloud();
  return createRealWaCloud({ phoneNumberId: env.WA_PHONE_NUMBER_ID!, token: env.WA_ACCESS_TOKEN!, version: env.WA_GRAPH_VERSION, businessAccountId: env.WA_BUSINESS_ACCOUNT_ID });
}

export * from "./types";
export { createMockWaCloud, type MockWaCloud } from "./mock";
export { createRealWaCloud } from "./real";
export { parseMetaWebhook, verifyChallenge, verifyMetaSignature, type InboundMessage, type StatusUpdate } from "./webhook";
