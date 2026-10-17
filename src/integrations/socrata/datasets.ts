import type { RepsProvider, RuesCompany, SocrataRow } from "./types";

export const RUES_DATASET = "c82u-588k";
export const REPS_DATASET = "c36g-9fc2";

/** CIIU rev. 4 A.C. (Colombia): 8622 = práctica odontológica, 5611 = restaurantes. */
export const CIIU = { dental: "8622", restaurants: "5611" } as const;

/** Escapes a SoQL string literal. */
export const soql = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * RUES where clause. The dataset has no municipio column: `camara_comercio` (e.g. BOGOTA) is the
 * geographic proxy. Only ACTIVA registrations and no PERSONA NATURAL.
 */
export function ruesWhere(opts: { ciiu: string; camara: string }): string {
  return [
    `cod_ciiu_act_econ_pri=${soql(opts.ciiu)}`,
    `camara_comercio=${soql(opts.camara)}`,
    `estado_matricula='ACTIVA'`,
    `organizacion_juridica!='PERSONA NATURAL'`,
  ].join(" AND ");
}

export const RUES_FIELDS = "razon_social,nit,cod_ciiu_act_econ_pri,organizacion_juridica,camara_comercio";

const BUSINESS_WORDS = new Set([
  "SERVICIOS", "SERVICIO", "SALUD", "ODONTO", "ODONTOLOGIA", "ODONTOLOGICA", "CLINICA", "DENTAL", "INVERSIONES", "SISTEMAS", "SYSTEM",
  "COMERCIAL", "RESTAURANTE", "COMIDAS", "GRUPO", "CENTRO", "CONSULTORIO", "IPS", "SAS", "LTDA", "CIA", "Y", "DE", "DEL", "LA", "EL",
  "INTERNACIONAL", "TECNOLOGIA", "CONSTRUCCIONES", "DISTRIBUCIONES", "ASESORIAS", "SOLUCIONES", "IMPORTACIONES", "PRODUCTOS",
]);

/**
 * Heuristic: sole-proprietorship names (E.U. / EMPRESA UNIPERSONAL) that read like a person's name
 * (2-5 alphabetic tokens, no business word). Flagged "possible natural person / to verify" and never
 * counted as contactable.
 */
export function looksLikePersonalName(razonSocial: string): boolean {
  const up = razonSocial
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (!/(\bE\.?\s?U\.?(\s|$|-)|EMPRESA UNIPERSONAL)/.test(up)) return false;
  const core = up
    .replace(/-?\s*EN LIQUIDACION.*/, "")
    .replace(/EMPRESA UNIPERSONAL/g, " ")
    .replace(/\bE\.?\s?U\.?(?=\s|$|-)/g, " ")
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (core.length < 2 || core.length > 5) return false;
  return !core.some((t) => BUSINESS_WORDS.has(t));
}

export function parseRues(rows: SocrataRow[]): RuesCompany[] {
  return rows
    .filter((r) => r.razon_social?.trim())
    .map((r) => ({
      nit: r.nit?.trim() || undefined,
      razonSocial: r.razon_social!.trim(),
      ciiu: r.cod_ciiu_act_econ_pri,
      organizacionJuridica: r.organizacion_juridica,
      camara: r.camara_comercio,
      isLegalEntity: !!r.organizacion_juridica && r.organizacion_juridica.trim().toUpperCase() !== "PERSONA NATURAL",
      possibleNaturalPerson: looksLikePersonalName(r.razon_social!),
    }));
}

export const DENTAL_NAME_KEYWORDS = ["ODONT", "DENTAL", "DENTIST", "ORTODON", "ENDODON", "PERIODON", "SONRIS", "SMILE"];

/**
 * REPS where clause for legal-entity IPS in Bogotá. Independent professionals (`Profesional
 * Independiente`) and non-NIT ids are excluded. Dental is detected by name keywords because REPS
 * lists providers/sites, not services, in this dataset.
 */
export function repsWhere(opts: { municipio: string; nameKeywords?: readonly string[] }): string {
  const parts = [
    `upper(municipiosededesc) like ${soql(`%${opts.municipio.toUpperCase()}%`)}`,
    `claseprestador like 'Instituciones Prestadoras%'`,
    `tipoid='NI'`,
  ];
  if (opts.nameKeywords?.length) {
    const ors = opts.nameKeywords.flatMap((k) => [
      `upper(nombresede) like ${soql(`%${k}%`)}`,
      `upper(nombreprestador) like ${soql(`%${k}%`)}`,
    ]);
    parts.push(`(${ors.join(" OR ")})`);
  }
  return parts.join(" AND ");
}

export const REPS_FIELDS =
  "codigoprestador,nombresede,nombreprestador,numeroidentificacion,tipoid,claseprestador,email_sede,t_lefonosede,direcci_nsede";

export function parseReps(rows: SocrataRow[]): RepsProvider[] {
  return rows
    .filter((r) => (r.nombresede ?? r.nombreprestador)?.trim())
    .map((r) => ({
      providerCode: r.codigoprestador,
      nit: r.numeroidentificacion?.trim() || undefined,
      name: (r.nombresede ?? r.nombreprestador)!.trim(),
      email: r.email_sede?.trim() || undefined,
      phone: r.t_lefonosede?.trim() || undefined,
      address: r.direcci_nsede?.trim() || undefined,
      claseprestador: r.claseprestador,
      isLegalEntity: r.tipoid === "NI" && r.claseprestador !== "Profesional Independiente",
    }));
}
