import { MAX_CSV_BYTES, type CsvResult, type DaptaLeadRecord } from "./types";

export const CSV_HEADER = ["empresa", "telefono", "correo_generico", "ciudad", "fuente", "slug", "url_diagnostico", "notas"] as const;

/** Neutralise spreadsheet formulas (=, +, -, @, tab, CR) and quote when needed. */
export function csvCell(value: string): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const row = (cells: readonly string[]) => cells.map(csvCell).join(",");

/** Builds the Dapta-sequences CSV. Drops trailing rows rather than exceeding `maxBytes`. */
export function buildCsv(leads: DaptaLeadRecord[], maxBytes: number = MAX_CSV_BYTES): CsvResult {
  const lines = [row(CSV_HEADER)];
  let bytes = Buffer.byteLength(lines[0]!) + 2;
  let rows = 0;
  let truncated = false;
  for (const l of leads) {
    const line = row([l.company, l.phone, l.email, l.city, l.source, l.slug, l.diagnosticUrl, l.notes]);
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
