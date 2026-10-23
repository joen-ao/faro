import type { SourceCompany } from "../types";
import { accentInsensitive, sanitizeText, soql } from "./datasets";
import { genericEmailOnly } from "./search";
import { SOCRATA_LICENSE, type SocrataRow } from "./types";

/**
 * Extra public registries on datos.gov.co that carry company contact data (F21):
 * - SECOP II Proveedores Registrados: companies registered to sell to the State (any sector).
 * - RNT Registro Nacional de Turismo: tourism businesses (hotels, travel agencies, restaurants…).
 * - Supersolidaria: cooperatives, employee funds and mutuals.
 * Every query filters by city and by sector words in the name, so a hunt only reads matching rows.
 */
export type RegistrySource = "secop" | "rnt" | "solidaria";

export const SECOP_DATASET = "qmzu-gj57";
export const RNT_DATASET = "thwd-ivmp";
export const SOLIDARIA_DATASET = "kg2d-yfyg";

export const REGISTRY_DATASET: Record<RegistrySource, string> = { secop: SECOP_DATASET, rnt: RNT_DATASET, solidaria: SOLIDARIA_DATASET };

// Only company fields: representative names, ids and personal mailboxes are never requested.
export const SECOP_FIELDS = "codigo,nombre,nit,tipo_empresa,descripcion_categoria_principal,correo,telefono,sitio_web,direccion,municipio";
export const RNT_FIELDS =
  "codigo_rnt,razon_social_establecimiento,nit,categoria,sub_categoria,correo_establecimiento,correo_prestador,n_m_tel_fono,direcci_n_comercial_establecimiento,municipio";
// One row per entity and month: grouped by NIT so every entity comes once (aliases differ from the columns the WHERE uses).
export const SOLIDARIA_FIELDS =
  "nit,max(nombreentidad) as entidad,max(nombreactividad) as actividad,max(nombretipo) as tipo_entidad,max(correo) as correo_entidad,max(direccion) as direccion_entidad";

/** Colombian company NITs are 9 digits starting with 8 or 9 (natural persons use their ID number). */
export function companyNit(raw?: string, hasCheckDigit = false): string | undefined {
  let d = (raw ?? "").replace(/\D/g, "");
  if (hasCheckDigit && d.length === 10) d = d.slice(0, 9);
  return /^[89]\d{8}$/.test(d) ? d : undefined;
}

/** City filter body: the first letters of the (accentless) city, enough to match "BOGOTA D.C." or "BOGOTÁ, D.C.". */
const cityPrefix = (city: string) => accentInsensitive(sanitizeText(city).toUpperCase()).slice(0, 6);

const nameOr = (columns: string[], keywords: readonly string[]) => {
  const kws = keywords.map((k) => sanitizeText(k).toUpperCase()).filter(Boolean);
  if (!kws.length) throw new Error("At least one sector keyword is required");
  // Word start only: TRIBU must not match DISTRIBUIDORES, SMILE must not match TRANSMILENIO.
  return `(${kws.flatMap((k) => columns.flatMap((c) => [`upper(${c}) like ${soql(`${k}%`)}`, `upper(${c}) like ${soql(`% ${k}%`)}`])).join(" OR ")})`;
};

export function registryWhere(source: RegistrySource, opts: { city: string; dane?: string; keywords: readonly string[]; includeNatural?: boolean }): string {
  if (opts.dane !== undefined && !/^\d{5}$/.test(opts.dane)) throw new Error("Invalid DANE municipio code");
  const like = `upper(municipio) like ${soql(`${cityPrefix(opts.city)}%`)}`;
  if (source === "secop") {
    return [
      opts.dane ? `ubicacion like ${soql(`%-${opts.dane}`)}` : like,
      `esta_activa='Si'`,
      ...(opts.includeNatural ? [] : [`tipo_empresa not like 'PERSONA NATURAL%'`]),
      nameOr(["nombre", "descripcion_categoria_principal"], opts.keywords),
    ].join(" AND ");
  }
  if (source === "rnt") {
    return [
      opts.dane ? `cod_mun=${soql(opts.dane)}` : like,
      `estado_rnt='ACTIVO'`,
      `tipo_prestador='Comerciante'`,
      nameOr(["razon_social_establecimiento", "categoria", "sub_categoria"], opts.keywords),
    ].join(" AND ");
  }
  return [like, nameOr(["nombreentidad", "nombreactividad"], opts.keywords)].join(" AND ");
}

const clean = (s?: string) => {
  const v = s?.trim();
  return v && !/^(no provisto|no definido|sin dato|n\/a|na|0)$/i.test(v) ? v : undefined;
};

/** A plain domain or URL becomes `https://host`; anything else (text, emails) is dropped. */
export function normalizeWebsite(raw?: string): string | undefined {
  const v = clean(raw)?.toLowerCase();
  if (!v || v.includes("@") || /\s/.test(v)) return undefined;
  try {
    const u = new URL(/^https?:\/\//.test(v) ? v : `https://${v}`);
    if (!/\.[a-z]{2,}$/.test(u.hostname)) return undefined;
    return `https://${u.hostname.replace(/^www\./, "")}`;
  } catch {
    return undefined;
  }
}

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    .trim();

const keywordIn = (texts: Array<string | undefined>, keywords: readonly string[]) => {
  const hay = texts.filter(Boolean).join(" ").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  // Word start, spaces kept: "IMPRESION 3D" matches "... IMPRESION 3D SAS"; TRIBU never matches DISTRIBUIDORES.
  return keywords.find((k) => new RegExp(`(^|[^A-Z0-9])${k.toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim().replace(/\s+/g, "\\s+")}`).test(hay));
};

/** Any valid mailbox: the business contact an independent registered (kept, never contacted automatically). */
const personalOk = (e?: string) => {
  const v = e?.trim().toLowerCase();
  return v && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : undefined;
};

const LABEL: Record<RegistrySource, string> = { secop: "SECOP II", rnt: "RNT", solidaria: "Supersolidaria" };

export interface RegistryConversion {
  companies: SourceCompany[];
  /** Rows dropped because they are not a company NIT (natural persons) or have no name. */
  excluded: number;
}

/**
 * Rows -> companies. Only company NITs pass; emails only when they are a generic company mailbox. The city is the
 * hunt city (every row was filtered by it); `sector_match` keeps the word that matched, as scoring evidence.
 */
export function registryToSource(source: RegistrySource, rows: SocrataRow[], ctx: { city: string; keywords: readonly string[]; includeNatural?: boolean }, isMock: boolean): RegistryConversion {
  const out: SourceCompany[] = [];
  let excluded = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const name = clean(source === "secop" ? r.nombre : source === "rnt" ? r.razon_social_establecimiento : r.entidad);
    const companyId = companyNit(r.nit, source === "solidaria");
    // Independents: a natural person's ID number (6+ digits) when the hunt includes them; never otherwise.
    const personId = !companyId && ctx.includeNatural ? (r.nit ?? "").replace(/\D/g, "").replace(/^0+/, "") : "";
    const independent = !companyId && personId.length >= 6 && personId.length <= 11;
    const nit = companyId ?? (independent ? personId : undefined);
    if (!name || !nit) {
      excluded++;
      continue;
    }
    const externalId = source === "rnt" && r.codigo_rnt ? `rnt:${r.codigo_rnt}` : `${source}:${nit}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    const match = keywordIn(source === "secop" ? [name, r.descripcion_categoria_principal] : source === "rnt" ? [name, r.categoria, r.sub_categoria] : [name, r.actividad], ctx.keywords);
    const pickEmail = independent ? personalOk : genericEmailOnly;
    const email = source === "rnt" ? (pickEmail(r.correo_establecimiento) ?? pickEmail(r.correo_prestador)) : pickEmail(source === "solidaria" ? r.correo_entidad : r.correo);
    const phone = clean(source === "rnt" ? r.n_m_tel_fono : r.telefono);
    const raw: Record<string, string> = {};
    if (independent) raw.independiente = "1";
    if (match) raw.sector_match = `${LABEL[source]}: el registro contiene «${match}»`;
    if (source === "secop" && clean(r.descripcion_categoria_principal)) raw.categoria = r.descripcion_categoria_principal!.trim();
    if (source === "rnt" && r.categoria) raw.categoria = r.categoria.trim();
    if (source === "solidaria" && r.tipo_entidad) raw.tipo = r.tipo_entidad.trim();
    out.push({
      name: titleCase(name).slice(0, 200),
      nit,
      address: clean(source === "rnt" ? r.direcci_n_comercial_establecimiento : source === "solidaria" ? r.direccion_entidad : r.direccion),
      city: ctx.city,
      website: source === "secop" ? normalizeWebsite(r.sitio_web) : undefined,
      phone: phone && /\d{7,}/.test(phone.replace(/\D/g, "")) ? phone : undefined,
      email,
      externalId,
      sourceChannel: source,
      sourceUrl: `https://www.datos.gov.co/resource/${REGISTRY_DATASET[source]}`,
      license: SOCRATA_LICENSE,
      isLegalEntity: !independent,
      possibleNaturalPerson: independent,
      raw,
      isMock,
    });
  }
  return { companies: out, excluded };
}
