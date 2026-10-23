import type { SourceCompany } from "../types";

export interface SocrataQuery {
  select?: string;
  where?: string;
  group?: string;
  order?: string;
  limit?: number;
  offset?: number;
  /** Independents search: rows of natural persons are cached as they are (their registry data is the business record). */
  keepPersonal?: boolean;
}

export type SocrataRow = Record<string, string | undefined>;

export interface SocrataResult {
  rows: SocrataRow[];
  latencyMs: number;
  fromCache: boolean;
  isMock: boolean;
}

export interface SocrataAdapter {
  query(dataset: string, q: SocrataQuery): Promise<SocrataResult>;
  /** `select count(*)` with an optional $where. */
  count(dataset: string, where?: string): Promise<{ count: number; latencyMs: number }>;
  /** Pages through `query` ($limit/$offset) until exhausted or `maxRows` reached. */
  queryAll(dataset: string, q: SocrataQuery, opts?: { pageSize?: number; maxRows?: number }): Promise<SocrataResult>;
}

export const SOCRATA_ATTRIBUTION = "Datos abiertos Colombia (datos.gov.co), licencia CC BY-SA 4.0";
export const SOCRATA_LICENSE = "CC BY-SA 4.0 · datos.gov.co";

/** Shape of an `api_calls` row (SPEC §6) produced by each real network call. */
export interface ApiCallRecord {
  service: "socrata";
  endpoint: string;
  status: number | null;
  latencyMs: number;
  error: string | null;
  costUsd: number;
  isMock: boolean;
}

/** Injectable logger: wire to a DB insert in `api_calls`. Errors thrown here are swallowed. */
export type ApiCallLogger = (call: ApiCallRecord) => void | Promise<void>;

/** Normalised legal-entity record from RUES (no personal names kept). */
export interface RuesCompany {
  nit?: string;
  razonSocial: string;
  ciiu?: string;
  organizacionJuridica?: string;
  camara?: string;
  isLegalEntity: boolean;
  /** E.U. whose name reads like a person: "posible persona natural / por verificar". */
  possibleNaturalPerson: boolean;
}

/** Normalised provider site from REPS (legal entities only, no personal names kept). */
export interface RepsProvider {
  providerCode?: string;
  nit?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  municipio?: string;
  claseprestador?: string;
  isLegalEntity: boolean;
  possibleNaturalPerson: boolean;
}

export type HealthService = "dental";

export interface RuesSearch {
  /** CIIU codes (4 digits), e.g. ["8622"]. */
  ciiu: string[];
  /** Cámara de comercio (RUES has no municipio column), e.g. "BOGOTA". */
  camara: string;
  maxRows?: number;
}

export interface RepsSearch {
  municipio: string;
  /** Health plugin preset (name keywords) when REPS has no service field. */
  service?: HealthService;
  keywords?: string[];
  maxRows?: number;
}

export interface SourceSearchResult {
  companies: SourceCompany[];
  /** Rows dropped by the legal-entity filter (counts only, no names). */
  excluded: { naturalPerson: number; lookalike: number; noName: number };
  totalRows: number;
  isMock: boolean;
  latencyMs: number;
}

export interface SocrataSource {
  searchRues(s: RuesSearch): Promise<SourceSearchResult>;
  searchReps(s: RepsSearch): Promise<SourceSearchResult>;
}
