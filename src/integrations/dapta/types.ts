import type { Env } from "@/lib/env";

export type DaptaMode = Env["DAPTA_MODE"];

/** One lead as Dapta sees it. Only generic company contacts, never personal names. */
export interface DaptaLeadRecord {
  leadId: string;
  slug: string;
  company: string;
  phone: string;
  email: string;
  city: string;
  source: string;
  diagnosticUrl: string;
  notes: string;
  isDemo: boolean;
  /** "Servicio sugerido: X · porque …" for this lead (deterministic), or "". */
  suggestedService?: string;
  /** What we offer, as context for the Dapta agent: service, outcome and entry offer. */
  offer?: string;
}

export type PushStatus = "sent" | "simulated" | "skipped" | "failed";

export interface PushResult {
  status: PushStatus;
  /** Number of leads included in the request (or that would have been). */
  count: number;
  /** Why nothing was sent, or the error. */
  reason?: string;
  httpStatus?: number;
  /** True when the result did not come from a real Dapta endpoint. */
  isMock: boolean;
}

export interface CsvResult {
  csv: string;
  rows: number;
  bytes: number;
  /** True when rows were dropped to respect the 5 MB cap. */
  truncated: boolean;
}

export interface DaptaQualifierAdapter {
  readonly mode: DaptaMode;
  readonly isMock: boolean;
  push(leads: DaptaLeadRecord[]): Promise<PushResult>;
  exportCsv(leads: DaptaLeadRecord[]): CsvResult;
}

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
