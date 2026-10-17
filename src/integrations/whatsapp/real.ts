import { csvCell, phoneCell } from "@/integrations/dapta/csv";
import { MAX_CSV_BYTES, type CsvResult } from "@/integrations/dapta/types";
import { E164, WHATSAPP_CSV_HEADER, WHATSAPP_TEMPLATE, type WhatsappAdapter, type WhatsappRow } from "./types";

/** Builds the Dapta WhatsApp-sequence CSV (formula-safe, E.164 only, <= 5 MB). Nothing is sent from Faro. */
export function buildWhatsappCsv(rows: WhatsappRow[], maxBytes: number = MAX_CSV_BYTES): CsvResult {
  const lines = [WHATSAPP_CSV_HEADER.map(csvCell).join(",")];
  let bytes = Buffer.byteLength(lines[0]!) + 2;
  let count = 0;
  let truncated = false;
  for (const r of rows) {
    if (!E164.test(r.phone)) continue;
    const line = [csvCell(r.company), phoneCell(r.phone), csvCell(WHATSAPP_TEMPLATE), csvCell(r.diagnosticUrl), csvCell(r.optOutUrl), csvCell(r.slug)].join(",");
    const size = Buffer.byteLength(line) + 2;
    if (bytes + size > maxBytes) {
      truncated = true;
      break;
    }
    lines.push(line);
    bytes += size;
    count++;
  }
  return { csv: lines.join("\r\n") + "\r\n", rows: count, bytes, truncated };
}

export function createRealWhatsappAdapter(): WhatsappAdapter {
  return { mode: "dapta_csv", enabled: true, isMock: false, exportCsv: (rows) => buildWhatsappCsv(rows) };
}
