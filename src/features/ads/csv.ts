import { z } from "zod";

export const MAX_CSV_BYTES = 1_000_000;
export const MAX_CSV_ROWS = 5000;

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    // Formula injection (=, +, -, @) and control characters are rejected, not escaped.
    .refine((v) => !/^[=+\-@\t\r]/.test(v) && !/[\u0000-\u001f]/.test(v), "texto no permitido (fórmula o caracteres de control)");

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha ISO yyyy-mm-dd")
  .refine((d) => {
    const t = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
  }, "fecha inexistente");

const asString = (v: unknown) => (typeof v === "number" ? String(v) : v);
const count = z.preprocess(asString, z.string().trim().regex(/^\d{1,9}$/, "entero >= 0").transform(Number));

export const spendRowSchema = z.object({
  platform: text(40).default("meta"),
  campaign: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().regex(/^[A-Za-z0-9_.][A-Za-z0-9_. -]{0,79}$/, "campaña: letras, números, _ . - y espacios; no puede empezar con -")),
  date: isoDate,
  usd: z.preprocess(asString, z.string().trim().regex(/^\d{1,9}(\.\d{1,6})?$/, "USD >= 0 con hasta 6 decimales").transform(Number)),
  impressions: count.default(0),
  clicks: count.default(0),
});
export type SpendRow = z.output<typeof spendRowSchema>;

export interface CsvRowError {
  /** 1-based line number in the file (header = line 1); 0 = whole file */
  line: number;
  error: string;
}
export interface ParsedSpendCsv {
  rows: SpendRow[];
  errors: CsvRowError[];
}

/** RFC-4180-ish splitter: quoted fields, doubled quotes, CRLF. Returns rows with their starting line. */
function splitCsv(input: string): { line: number; cells: string[] }[] {
  const out: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cur = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  const endRow = () => {
    cells.push(cur);
    if (cells.some((c) => c.trim() !== "")) out.push({ line: start, cells });
    cells = [];
    cur = "";
  };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        cur += ch;
      }
    } else if (ch === '"' && cur === "") quoted = true;
    else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      endRow();
      line++;
      start = line;
    } else cur += ch;
  }
  if (cur !== "" || cells.length) endRow();
  return out;
}

const HEADERS = ["platform", "campaign", "date", "usd", "impressions", "clicks"] as const;
const REQUIRED = ["campaign", "date", "usd"];

/** Parses an ad-spend CSV. Valid rows are returned; invalid ones come back as per-line errors. Never throws on content. */
export function parseSpendCsv(input: string): ParsedSpendCsv {
  if (new TextEncoder().encode(input).length > MAX_CSV_BYTES) return { rows: [], errors: [{ line: 0, error: "archivo mayor a 1 MB" }] };
  const table = splitCsv(input.replace(/^﻿/, ""));
  if (!table.length) return { rows: [], errors: [{ line: 0, error: "archivo vacío" }] };
  const header = table[0].cells.map((h) => h.trim().toLowerCase());
  const unknown = header.filter((h) => !(HEADERS as readonly string[]).includes(h));
  const missing = REQUIRED.filter((h) => !header.includes(h));
  if (unknown.length || missing.length || new Set(header).size !== header.length) {
    return {
      rows: [],
      errors: [{ line: 1, error: `cabecera inválida: se espera ${HEADERS.join(",")} (platform, impressions y clicks opcionales)${missing.length ? `; faltan ${missing.join(", ")}` : ""}` }],
    };
  }
  const body = table.slice(1);
  if (body.length > MAX_CSV_ROWS) return { rows: [], errors: [{ line: 0, error: `máximo ${MAX_CSV_ROWS} filas` }] };
  const rows: SpendRow[] = [];
  const errors: CsvRowError[] = [];
  const seen = new Set<string>();
  for (const { line, cells } of body) {
    if (cells.length > header.length) {
      errors.push({ line, error: "demasiadas columnas" });
      continue;
    }
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      const v = cells[i];
      // Optional columns left empty fall back to their defaults.
      if (v !== undefined && !(v.trim() === "" && !REQUIRED.includes(h))) obj[h] = v;
    });
    const r = spendRowSchema.safeParse(obj);
    if (!r.success) {
      errors.push({ line, error: r.error.issues.map((i) => `${i.path.join(".") || "fila"}: ${i.message}`).join("; ") });
      continue;
    }
    const key = `${r.data.platform}|${r.data.campaign}|${r.data.date}`;
    if (seen.has(key)) {
      errors.push({ line, error: "duplicada en el archivo (plataforma, campaña y fecha)" });
      continue;
    }
    seen.add(key);
    rows.push(r.data);
  }
  return { rows, errors };
}
