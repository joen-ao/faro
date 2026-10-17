import type { SourceCompany } from "../types";
import {
  HEALTH_SERVICE_KEYWORDS,
  REPS_DATASET,
  REPS_FIELDS,
  RUES_DATASET,
  RUES_FIELDS,
  assertDatasetId,
  parseReps,
  parseRues,
  repsWhere,
  ruesWhere,
} from "./datasets";
import {
  SOCRATA_LICENSE,
  type RepsSearch,
  type RuesSearch,
  type SocrataAdapter,
  type SocrataRow,
  type SocrataSource,
  type SourceSearchResult,
} from "./types";

const GENERIC_LOCAL = /^(info|contacto|contact|citas|hola|ventas|servicioalcliente|atencion|atencionalcliente|recepcion|administracion|gerencia|comercial|clientes|admisiones|facturacion|pqrs|soporte)$/i;
const PHONE_MASK = /^[0\-\s]*$/;

/** Keeps an email only if its local part is a generic company mailbox (never a personal name). */
export function genericEmailOnly(email?: string): string | undefined {
  const e = email?.trim().toLowerCase();
  if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.endsWith("@example.invalid")) return undefined;
  const local = e.split("@")[0].replace(/[._-]?\d+$/, "");
  return GENERIC_LOCAL.test(local) ? e : undefined;
}

const titleCase = (s?: string) =>
  s
    ?.toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    .trim() || undefined;

const stableId = (s: string) => {
  let h = 5381;
  for (const ch of s.toUpperCase()) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
};

const emptyExcluded = () => ({ naturalPerson: 0, lookalike: 0, noName: 0 });

export function ruesToSource(rows: SocrataRow[], isMock: boolean): Pick<SourceSearchResult, "companies" | "excluded"> {
  const excluded = emptyExcluded();
  const companies: SourceCompany[] = [];
  const named = rows.filter((r) => r._personal !== "1" && r.razon_social?.trim());
  excluded.noName = rows.filter((r) => r._personal !== "1").length - named.length;
  excluded.lookalike += rows.filter((r) => r._personal === "1").length;
  const seen = new Set<string>();
  for (const c of parseRues(named)) {
    if (!c.isLegalEntity) {
      excluded.naturalPerson++;
      continue;
    }
    if (c.possibleNaturalPerson) {
      excluded.lookalike++;
      continue;
    }
    const key = c.nit ?? `n-${stableId(c.razonSocial)}`;
    const externalId = `rues:${key}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    companies.push({
      name: c.razonSocial,
      nit: c.nit,
      city: titleCase(c.camara),
      externalId,
      sourceChannel: "rues",
      sourceUrl: `https://www.datos.gov.co/resource/${RUES_DATASET}`,
      license: SOCRATA_LICENSE,
      isLegalEntity: true,
      possibleNaturalPerson: false,
      raw: pick({ ciiu: c.ciiu, organizacion_juridica: c.organizacionJuridica, camara_comercio: c.camara }),
      isMock,
    });
  }
  return { companies, excluded };
}

export function repsToSource(rows: SocrataRow[], isMock: boolean): Pick<SourceSearchResult, "companies" | "excluded"> {
  const excluded = emptyExcluded();
  excluded.lookalike += rows.filter((r) => r._personal === "1").length;
  const live = rows.filter((r) => r._personal !== "1");
  const providers = parseReps(live);
  excluded.noName = live.length - providers.length;
  const companies: SourceCompany[] = [];
  const seen = new Set<string>();
  for (const p of providers) {
    if (!p.isLegalEntity) {
      excluded.naturalPerson++;
      continue;
    }
    if (p.possibleNaturalPerson) {
      excluded.lookalike++;
      continue;
    }
    const externalId = `reps:${p.providerCode ?? `n-${stableId(p.name)}`}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    companies.push({
      name: p.name,
      nit: p.nit,
      address: p.address,
      city: titleCase(p.municipio),
      phone: p.phone && !PHONE_MASK.test(p.phone) ? p.phone : undefined,
      email: genericEmailOnly(p.email),
      externalId,
      sourceChannel: "reps",
      sourceUrl: `https://www.datos.gov.co/resource/${REPS_DATASET}`,
      license: SOCRATA_LICENSE,
      isLegalEntity: true,
      possibleNaturalPerson: false,
      raw: pick({ claseprestador: p.claseprestador, municipio: p.municipio }),
      isMock,
    });
  }
  return { companies, excluded };
}

function pick(o: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter((e): e is [string, string] => !!e[1]));
}

export interface SocrataSourceOptions {
  ruesDataset?: string;
  repsDataset?: string;
}

/** High-level, compliance-filtered search on top of any `SocrataAdapter` (real or mock). */
export function createSocrataSource(adapter: SocrataAdapter, opts: SocrataSourceOptions = {}): SocrataSource {
  const rues = assertDatasetId(opts.ruesDataset ?? RUES_DATASET);
  const reps = assertDatasetId(opts.repsDataset ?? REPS_DATASET);
  return {
    async searchRues(s: RuesSearch) {
      const where = ruesWhere({ ciiu: s.ciiu, camara: s.camara });
      const r = await adapter.queryAll(rues, { select: RUES_FIELDS, where }, { pageSize: 10_000, maxRows: s.maxRows ?? 20_000 });
      return { ...ruesToSource(r.rows, r.isMock), totalRows: r.rows.length, isMock: r.isMock, latencyMs: r.latencyMs };
    },
    async searchReps(s: RepsSearch) {
      const nameKeywords = [...(s.service ? HEALTH_SERVICE_KEYWORDS[s.service] : []), ...(s.keywords ?? [])];
      const where = repsWhere({ municipio: s.municipio, nameKeywords: nameKeywords.length ? nameKeywords : undefined });
      const r = await adapter.queryAll(reps, { select: REPS_FIELDS, where }, { pageSize: 10_000, maxRows: s.maxRows ?? 20_000 });
      return { ...repsToSource(r.rows, r.isMock), totalRows: r.rows.length, isMock: r.isMock, latencyMs: r.latencyMs };
    },
  };
}
