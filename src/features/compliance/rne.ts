import { inArray, sql } from "drizzle-orm";
import { rneChecks } from "@/db/schema";
import type { AppDb } from "@/db/types";

/**
 * F55 · Registro de Números Excluidos (CRC, Ley 2300 de 2023). Before any commercial email, SMS, app message
 * (WhatsApp) or call to a natural person, the sender must check that the contact is not excluded. The CRC offers
 * individual checks, a bulk CSV check (up to 10.000 values, 3 MB) and an API; the registry updates daily at 2:00 a.m.
 * Faro stores each result and only treats a value as clear while its check is recent.
 */
export const RNE_MAX_AGE_DAYS = 30;
export const RNE_BULK_MAX = 10_000;

export type RneKind = "email" | "phone";
export type RneStatus = "clear" | "excluded" | "pending";

const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

/** Email -> lowercase; Colombian phone -> +57XXXXXXXXXX. Null when it is neither. */
export function normalizeRneValue(raw: string): { kind: RneKind; value: string } | null {
  const v = raw.trim().replace(/^["']|["']$/g, "");
  if (EMAIL.test(v)) return { kind: "email", value: v.toLowerCase() };
  let d = v.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("57")) d = d.slice(2);
  if (/^(3\d{9}|60\d{8})$/.test(d)) return { kind: "phone", value: `+57${d}` };
  return null;
}

/** Status of a stored check: clear only when not excluded and checked within `maxAgeDays`. */
export function statusOf(row: { excluded: boolean; checkedAt: Date } | undefined, now: Date, maxAgeDays = RNE_MAX_AGE_DAYS): RneStatus {
  if (!row) return "pending";
  if (row.excluded) return "excluded";
  return now.getTime() - row.checkedAt.getTime() <= maxAgeDays * 86_400_000 ? "clear" : "pending";
}

/** RNE status of each raw value (key = normalized value). Unknown or unparsable values are "pending". */
export async function rneStatuses(db: AppDb, raws: string[], now: Date = new Date()): Promise<Map<string, RneStatus>> {
  const norm = [...new Set(raws.map((r) => normalizeRneValue(r)?.value).filter((v): v is string => !!v))];
  const out = new Map<string, RneStatus>();
  for (let i = 0; i < norm.length; i += 500) {
    const part = norm.slice(i, i + 500);
    const rows = await db.select({ value: rneChecks.value, excluded: rneChecks.excluded, checkedAt: rneChecks.checkedAt }).from(rneChecks).where(inArray(rneChecks.value, part));
    const byValue = new Map(rows.map((r) => [r.value, r]));
    for (const v of part) out.set(v, statusOf(byValue.get(v), now));
  }
  return out;
}

export async function rneStatus(db: AppDb, raw: string, now: Date = new Date()): Promise<RneStatus> {
  const n = normalizeRneValue(raw);
  if (!n) return "pending";
  return (await rneStatuses(db, [n.value], now)).get(n.value) ?? "pending";
}

/** CSV for the CRC bulk check: one value per line under a single header (Faro keeps the mapping, not the CRC). */
export function rneExportCsv(values: string[]): string {
  const uniq = [...new Set(values.map((v) => normalizeRneValue(v)).filter((n): n is { kind: RneKind; value: string } => !!n).map((n) => (n.kind === "phone" ? n.value.slice(3) : n.value)))];
  return ["dato", ...uniq.slice(0, RNE_BULK_MAX)].join("\n") + "\n";
}

export interface RneImportResult {
  ok: boolean;
  error?: string;
  /** Header row as read, to adapt the parser when the CRC format is new to Faro. */
  headers?: string[];
  checked: number;
  excluded: number;
  ignored: number;
}

function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === sep && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** Columns that tell whether a channel is excluded (by name), and cells that mean "yes, excluded". */
const CHANNEL_COL = /(excluid|exclusion|estado|bloque|restring|sms|mensaje|llamada|voz|correo|email|aplicacion|whatsapp|canal)/;
const YES = /^(si|s|x|true|1|excluido|excluida|bloqueado|bloqueada|inscrito|inscrita|registrado|registrada|no contactar)$/;
const NO = /^(no|n|false|0|no excluido|no excluida|libre|no inscrito|no inscrita|no registrado|no registrada|habilitado|habilitada)$/;

/**
 * Reads the result file of the CRC bulk check. Tolerant: any delimiter, one column with the email/phone and one or
 * more columns saying whether it is excluded (per channel or overall). Every value in the file is stored as checked
 * at `checkedAt`. When no exclusion column is recognized nothing is stored and the headers come back, so the file
 * format can be added instead of guessing.
 */
export async function importRneResult(db: AppDb, text: string, checkedAt: Date = new Date(), source = "csv"): Promise<RneImportResult> {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { ok: false, error: "El archivo está vacío o no tiene filas.", checked: 0, excluded: 0, ignored: 0 };
  const sep = [";", ",", "\t", "|"].sort((a, b) => lines[0]!.split(b).length - lines[0]!.split(a).length)[0]!;
  const headers = splitCsv(lines[0]!, sep);
  const fh = headers.map(fold);
  const statusCols = fh.map((h, i) => (CHANNEL_COL.test(h) ? i : -1)).filter((i) => i >= 0);
  // A column named "correo"/"telefono" may hold the value itself: decide per row below.
  const rows: { kind: RneKind; value: string; excluded: boolean; channels: string[] }[] = [];
  let ignored = 0;
  let sawStatus = false;
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line, sep);
    let found: { kind: RneKind; value: string } | null = null;
    let valueCol = -1;
    cells.forEach((c, i) => {
      if (!found) {
        const n = normalizeRneValue(c);
        if (n) {
          found = n;
          valueCol = i;
        }
      }
    });
    if (!found) {
      ignored++;
      continue;
    }
    const channels: string[] = [];
    let anyKnown = false;
    for (const i of statusCols) {
      if (i === valueCol || i >= cells.length) continue;
      const c = fold(cells[i]!);
      if (YES.test(c)) {
        anyKnown = true;
        channels.push(headers[i]!);
      } else if (NO.test(c)) anyKnown = true;
    }
    if (anyKnown) sawStatus = true;
    rows.push({ ...(found as { kind: RneKind; value: string }), excluded: channels.length > 0, channels });
  }
  if (!rows.length) return { ok: false, error: "No se encontró ningún correo ni teléfono en el archivo.", headers, checked: 0, excluded: 0, ignored };
  if (!sawStatus) return { ok: false, error: "No se reconoció la columna que indica si el dato está excluido. Envía este archivo al equipo para adaptar Faro.", headers, checked: 0, excluded: 0, ignored };
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500).map((r) => ({ ...r, source, checkedAt }));
    await db
      .insert(rneChecks)
      .values(part)
      .onConflictDoUpdate({ target: rneChecks.value, set: { excluded: sql`excluded.excluded`, channels: sql`excluded.channels`, source: sql`excluded.source`, checkedAt: sql`excluded.checked_at`, kind: sql`excluded.kind` } });
  }
  return { ok: true, headers, checked: rows.length, excluded: rows.filter((r) => r.excluded).length, ignored };
}

export interface RnePendingSummary {
  /** Values (emails and Colombian phones) of fit, never-contacted natural persons and personal company mobiles. */
  values: string[];
  clear: number;
  excluded: number;
  pending: number;
}

/**
 * Contacts that need an RNE answer before an automatic message: emails and mobiles of fit independents, and
 * non-generic mobiles of fit companies, whose company was never contacted. Counts include the already checked ones.
 */
export async function rnePending(db: AppDb, now: Date = new Date()): Promise<RnePendingSummary> {
  const rows = (await db.execute(sql`
    select distinct cp.value
    from leads l
    join companies c on c.id = l.company_id
    join contact_points cp on cp.company_id = c.id
    where l.status = 'fit' and not l.is_demo and not c.is_demo
      and (
        (not c.is_legal_entity and cp.type in ('email', 'phone', 'whatsapp'))
        or (c.is_legal_entity and cp.type in ('phone', 'whatsapp') and not cp.is_generic)
      )
      and not exists (
        select 1 from messages m join leads l2 on l2.id = m.lead_id
        where l2.company_id = c.id and m.status not in ('simulated', 'draft')
      )
  `)) as unknown as { value: string }[] | { rows: { value: string }[] };
  const list = (Array.isArray(rows) ? rows : rows.rows).map((r) => r.value);
  const norm = [...new Set(list.map((v) => normalizeRneValue(v)).filter((n): n is { kind: RneKind; value: string } => !!n && (n.kind === "email" || /^\+573/.test(n.value))).map((n) => n.value))];
  const st = await rneStatuses(db, norm, now);
  const pending = norm.filter((v) => st.get(v) === "pending");
  return { values: pending, clear: norm.filter((v) => st.get(v) === "clear").length, excluded: norm.filter((v) => st.get(v) === "excluded").length, pending: pending.length };
}
