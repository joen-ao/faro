import { MAX_CSV_BYTES, type CsvResult, type DaptaLeadRecord } from "./types";

export const CSV_HEADER = ["empresa", "telefono", "correo_generico", "ciudad", "fuente", "slug", "url_diagnostico", "notas", "servicio_sugerido", "oferta"] as const;

/** Neutralise spreadsheet formulas (=, +, -, @, tab, CR) and quote when needed. */
export function csvCell(value: string): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const PURE_PHONE = /^\+?[\d\s().-]+$/;
/** A pure phone number (E.164 etc.) is not a formula: keep the leading "+" so it can be dialled. */
export const phoneCell = (v: string) => (PURE_PHONE.test(v) ? v : csvCell(v));

const row = (cells: readonly string[]) => cells.map(csvCell).join(",");

/** Builds the Dapta-sequences CSV. Drops trailing rows rather than exceeding `maxBytes`. */
export function buildCsv(leads: DaptaLeadRecord[], maxBytes: number = MAX_CSV_BYTES): CsvResult {
  const lines = [row(CSV_HEADER)];
  let bytes = Buffer.byteLength(lines[0]!) + 2;
  let rows = 0;
  let truncated = false;
  for (const l of leads) {
    const line = [csvCell(l.company), phoneCell(l.phone), ...[l.email, l.city, l.source, l.slug, l.diagnosticUrl, l.notes, l.suggestedService ?? "", l.offer ?? ""].map(csvCell)].join(",");
    const size = Buffer.byteLength(line) + 2;
    if (bytes + size > maxBytes) {
      truncated = true;
      break;
    }
    lines.push(line);
    bytes += size;
    rows++;
  }
  return { csv: lines.join("\r\n") + "\r\n", rows, bytes, truncated };
}
