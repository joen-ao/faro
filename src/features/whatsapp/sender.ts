import { daptaFlowSender, type WaSender } from "@/integrations/whatsapp/dapta-flow";
import type { Env } from "@/lib/env";

/** Real Dapta flow sender when WHATSAPP_SEND_MODE=dapta_flow and the flow URL is set; otherwise null (disabled). */
export function getWaSender(env: Env): WaSender | null {
  if (env.WHATSAPP_SEND_MODE !== "dapta_flow" || !env.DAPTA_WA_FLOW_URL) return null;
  return daptaFlowSender(env.DAPTA_WA_FLOW_URL);
}
