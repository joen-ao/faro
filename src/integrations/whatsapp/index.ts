import { getEnv, type Env } from "@/lib/env";
import { createMockWhatsappAdapter } from "./mock";
import { createRealWhatsappAdapter } from "./real";
import type { WhatsappAdapter } from "./types";

export function getWhatsappAdapter(env: Pick<Env, "WHATSAPP_ENABLED"> = getEnv()): WhatsappAdapter {
  return env.WHATSAPP_ENABLED ? createRealWhatsappAdapter() : createMockWhatsappAdapter();
}

export * from "./types";
export { buildWhatsappCsv } from "./real";
export { selectWhatsappRows, reservationId, type WhatsappSelection } from "./select";
