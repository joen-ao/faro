import { buildWhatsappCsv } from "./real";
import type { WhatsappAdapter } from "./types";

/** WHATSAPP_ENABLED=false: the feature is off, so the export is always an empty (header only) CSV. */
export function createMockWhatsappAdapter(): WhatsappAdapter {
  return { mode: "dapta_csv", enabled: false, isMock: true, exportCsv: () => buildWhatsappCsv([]) };
}
