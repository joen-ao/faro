import type { RepsProvider, RuesCompany, SocrataRow } from "./types";

export const RUES_DATASET = "c82u-588k";
export const REPS_DATASET = "c36g-9fc2";

/** CIIU rev. 4 A.C. (Colombia): 8622 = práctica odontológica, 5611 = restaurantes. */
export const CIIU = { dental: "8622", restaurants: "5611" } as const;

/** Escapes a SoQL string literal: control characters dropped, single quotes doubled. */
export const soql = (s: string) => `'${s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/'/g, "''")}'`;

/**
 * Sanitises free text before it is placed inside a SoQL literal (including LIKE patterns): keeps
 * letters, digits, space, dot, dash; drops wildcards, quotes, `;`, backslashes, etc. Uppercases.
 */
export function sanitizeText(s: string, maxLen = 60): string {
  return s
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} .\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
    .toUpperCase();
}

/** Throws unless the value is a 4-digit CIIU code. */
export function assertCiiu(code: string): string {
  if (!/^\d{4}$/.test(code)) throw new Error(`Invalid CIIU code: ${JSON.stringify(code).slice(0, 20)}`);
  return code;
}

/** Throws unless the value looks like a Socrata dataset id (xxxx-xxxx). */
export function assertDatasetId(id: string): string {
  if (!/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(id)) throw new Error("Invalid Socrata dataset id");
  return id;
}

/** SoQL column/function lists ($select/$order) only allow identifiers, commas, parens, `*`, `:`. */
export function assertSoqlColumns(s: string): string {
  if (!/^[A-Za-z0-9_:,()*\s]+$/.test(s)) throw new Error("Invalid SoQL column list");
  return s;
}

/**
 * Accent-insensitive LIKE pattern body: REPS stores "BOGOTÁ, D.C." and SoQL `like` ignores no accents,
 * so vowels become the single-char wildcard `_` (added after sanitising, never from user input).
 */
export const accentInsensitive = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[AEIOU]/gi, "_");

const requireText = (label: string, v: string): string => {
  const clean = sanitizeText(v);
  if (!clean) throw new Error(`${label} is empty after sanitising`);
  return clean;
};

/**
 * RUES where clause. The dataset has no municipio column: `camara_comercio` (e.g. BOGOTA) is the
 * geographic proxy. Only ACTIVA registrations and no PERSONA NATURAL.
 */
export function ruesWhere(opts: { ciiu: string | readonly string[]; camara: string }): string {
  const codes = (Array.isArray(opts.ciiu) ? opts.ciiu : [opts.ciiu]).map(assertCiiu);
  if (!codes.length) throw new Error("At least one CIIU code is required");
  const ciiuClause =
    codes.length === 1 ? `cod_ciiu_act_econ_pri=${soql(codes[0])}` : `cod_ciiu_act_econ_pri in (${codes.map(soql).join(",")})`;
  return [
    ciiuClause,
    `camara_comercio=${soql(requireText("camara", opts.camara))}`,
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
    .replace(/[̀-ͯ]/g, "")
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

const isNaturalPersonOrg = (org?: string) => !!org && org.trim().toUpperCase() === "PERSONA NATURAL";

export function parseRues(rows: SocrataRow[]): RuesCompany[] {
  return rows
    .filter((r) => r.razon_social?.trim())
    .map((r) => ({
      nit: r.nit?.trim() || undefined,
      razonSocial: r.razon_social!.trim(),
      ciiu: r.cod_ciiu_act_econ_pri,
      organizacionJuridica: r.organizacion_juridica,
      camara: r.camara_comercio,
      isLegalEntity: !!r.organizacion_juridica && !isNaturalPersonOrg(r.organizacion_juridica),
      possibleNaturalPerson: looksLikePersonalName(r.razon_social!),
    }));
}

export const DENTAL_NAME_KEYWORDS = ["ODONT", "DENTAL", "DENTIST", "ORTODON", "ENDODON", "PERIODON", "SONRIS", "SMILE"];

/** Health-plugin presets: REPS has no service column in this dataset, so services map to name keywords. */
export const HEALTH_SERVICE_KEYWORDS = { dental: DENTAL_NAME_KEYWORDS } as const;

/**
 * REPS where clause for legal-entity IPS in a municipio. Independent professionals (`Profesional
 * Independiente`) and non-NIT ids are excluded. Dental is detected by name keywords because REPS
 * lists providers/sites, not services, in this dataset.
 */
export function repsWhere(opts: { municipio: string; nameKeywords?: readonly string[] }): string {
  const parts = [
    `upper(municipiosededesc) like ${soql(`%${accentInsensitive(requireText("municipio", opts.municipio))}%`)}`,
    `claseprestador like 'Instituciones Prestadoras%'`,
    `tipoid='NI'`,
  ];
  if (opts.nameKeywords?.length) {
    const kws = opts.nameKeywords.map((k) => sanitizeText(k)).filter(Boolean);
    const ors = kws.flatMap((k) => [`upper(nombresede) like ${soql(`%${k}%`)}`, `upper(nombreprestador) like ${soql(`%${k}%`)}`]);
    if (ors.length) parts.push(`(${ors.join(" OR ")})`);
  }
  return parts.join(" AND ");
}

export const REPS_FIELDS =
  "codigoprestador,nombresede,nombreprestador,numeroidentificacion,tipoid,claseprestador,municipiosededesc,email_sede,t_lefonosede,direcci_nsede";

export function parseReps(rows: SocrataRow[]): RepsProvider[] {
  return rows
    .filter((r) => (r.nombresede ?? r.nombreprestador)?.trim())
    .map((r) => {
      const name = (r.nombresede ?? r.nombreprestador)!.trim();
      return {
        providerCode: r.codigoprestador,
        nit: r.numeroidentificacion?.trim() || undefined,
        name,
        email: r.email_sede?.trim() || undefined,
        phone: r.t_lefonosede?.trim() || undefined,
        address: r.direcci_nsede?.trim() || undefined,
        municipio: r.municipiosededesc?.trim() || undefined,
        claseprestador: r.claseprestador,
        isLegalEntity: r.tipoid === "NI" && r.claseprestador !== "Profesional Independiente",
        possibleNaturalPerson: looksLikePersonalName(name),
      };
    });
}

/** True when a raw row describes a natural person / independent professional (for cache redaction). */
export function isPersonalRow(r: SocrataRow): boolean {
  if (isNaturalPersonOrg(r.organizacion_juridica)) return true;
  if (r.claseprestador === "Profesional Independiente") return true;
  if (r.tipoid && r.tipoid !== "NI") return true;
  const name = r.razon_social ?? r.nombresede ?? r.nombreprestador;
  return !!name && looksLikePersonalName(name);
}
