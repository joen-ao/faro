import type { WaSender } from "@/integrations/whatsapp/dapta-flow";
import { daptaFlowSender } from "@/integrations/whatsapp/dapta-flow";
import { getWaCloud, waCloudIsReal, type WaCloudAdapter } from "@/integrations/wa-cloud";
import type { Env } from "@/lib/env";

/** F45 · Sends a template through Meta's Cloud API. `templateId` is the Meta template name; `nombre` and `slug` fill
 * the body variable and the "Ver diagnóstico" URL button, as in the Dapta flow. */
export function cloudApiTemplateSender(cloud: WaCloudAdapter, language = "es"): WaSender & { kind: "cloud_api" } {
  return {
    kind: "cloud_api",
    isMock: cloud.isMock,
    async send(input) {
      try {
        const { wamid } = await cloud.sendTemplate(input.toNumber, { name: input.templateId, language, body: [input.nombre], urlButton: input.slug });
        return { ok: true, providerId: wamid };
      } catch (e) {
        return { ok: false, providerId: null, error: e instanceof Error ? e.message.slice(0, 200) : "error" };
      }
    },
  };
}

/** Whether template sending is configured for the current mode (the panel and the route show it). */
export function waSendEnabled(env: Env): boolean {
  if (env.WHATSAPP_SEND_MODE === "dapta_flow") return !!env.DAPTA_WA_FLOW_URL;
  if (env.WHATSAPP_SEND_MODE === "cloud_api") return waCloudIsReal(env);
  return false;
}

/**
 * Real Dapta flow sender (WHATSAPP_SEND_MODE=dapta_flow + flow URL) or Cloud API sender (cloud_api + real Cloud API
 * credentials); otherwise null (disabled). A mock Cloud API never sends templates: nothing would reach anyone.
 */
export function getWaSender(env: Env): WaSender | null {
  if (!waSendEnabled(env)) return null;
  if (env.WHATSAPP_SEND_MODE === "cloud_api") return cloudApiTemplateSender(getWaCloud(env));
  return daptaFlowSender(env.DAPTA_WA_FLOW_URL!);
}
