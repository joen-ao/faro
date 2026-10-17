export interface SocrataQuery {
  select?: string;
  where?: string;
  group?: string;
  order?: string;
  limit?: number;
  offset?: number;
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
  /** Pages through `query` until exhausted or `maxRows` reached. */
  queryAll(dataset: string, q: SocrataQuery, opts?: { pageSize?: number; maxRows?: number }): Promise<SocrataResult>;
}

export const SOCRATA_ATTRIBUTION = "Datos abiertos Colombia (datos.gov.co), licencia CC BY-SA 4.0";

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
  claseprestador?: string;
  isLegalEntity: boolean;
}
