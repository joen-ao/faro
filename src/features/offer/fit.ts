import { isGenericEmail, ownEmailDomain } from "@/features/compliance/email";
import { buildFindings, siteFactsFrom, type CompanyInput, type SourceInput } from "@/features/diagnostic/findings";
import { fold, isFindingKind, PRIORITY } from "./match";
import type { FindingKind } from "./schema";

/**
 * F48 · Who we write to and with what: a cold email only goes out when the sector has a pain one of our services
 * solves and the lead has a real, verifiable finding. Everything else is skipped with a reason.
 */
export interface Segment {
  id: "salud" | "contabilidad" | "operaciones" | "diseno" | "educacion" | "general";
  /** F54 · How the general email names the sector ("clínicas y consultorios"). */
  label: string;
  /** Folded fragments matched against the hunt's sector text. */
  match: readonly string[];
  /** Service ids (Tu oferta) that fit this sector, best first. */
  services: readonly string[];
  /** The pain in the sector's words, given to the model for the "consequence" sentence. */
  pain: string;
  /** F53 · Findings that may open a cold email in this sector (default: all site findings + "no-website"). */
  findings?: readonly FindingKind[];
}

export const SEGMENTS: readonly Segment[] = [
  {
    id: "salud",
    label: "clínicas y consultorios",
    match: ["odont", "dental", "clinic", "consultorio", "salud", "medic", "prestador"],
    services: ["agentes-ia", "landing-agente", "landing-webs"],
    pain: "pacientes que escriben o buscan cita fuera de horario y terminan agendando con otra clínica que responde primero",
  },
  {
    id: "contabilidad",
    label: "firmas contables",
    match: ["contab", "tribut", "contador", "revisor fiscal", "asesoria tributaria"],
    services: ["flujo-automatizacion", "rag", "agentes-ia", "mapa-automatizacion"],
    pain: "horas del equipo respondiendo las mismas preguntas de clientes y pasando datos a mano entre sistemas en temporada de declaraciones",
  },
  // F53 · New segments (supply chain / field service / manufacturing, interior design, schools).
  {
    id: "operaciones",
    label: "empresas de operación y logística",
    match: ["supply chain", "field service", "manufactur", "logistic", "industri", "cadena de suministro"],
    services: ["flujo-automatizacion", "mapa-automatizacion", "software-crm", "agentes-ia"],
    pain: "horas del equipo pasando datos a mano entre sistemas, cotizaciones que tardan días y clientes que esperan respuesta",
    findings: ["whatsapp", "form", "freshness"],
  },
  {
    id: "diseno",
    label: "estudios de diseño y arquitectura",
    match: ["diseno interior", "interiorismo", "arquitect", "remodelac"],
    services: ["landing-agente", "landing-webs", "agentes-ia"],
    pain: "clientes que piden cotización por Instagram o WhatsApp y se enfrían si nadie les responde rápido",
    findings: ["whatsapp", "form", "freshness", "no-website"],
  },
  {
    id: "educacion",
    label: "colegios",
    match: ["colegio", "institucion educativa", "instituciones educativas", "jardin infantil", "escuela"],
    services: ["agentes-ia", "rag"],
    pain: "padres que preguntan lo mismo (matrículas, costos, horarios) por teléfono y WhatsApp, y una secretaría que colapsa en temporada de matrículas",
    findings: ["whatsapp", "form", "freshness"],
  },
];

/** F54 · Segment for sectors without an offer of their own (general services email only). */
export const GENERAL_SEGMENT: Segment = {
  id: "general",
  label: "empresas como la suya",
  match: [],
  services: ["agentes-ia", "landing-webs", "flujo-automatizacion"],
  pain: "tiempo del equipo respondiendo lo mismo por WhatsApp y correo, y clientes que se enfrían si nadie responde rápido",
  findings: [],
};

export function segmentFor(sector: string | null | undefined): Segment | null {
  const s = fold(sector ?? "");
  if (!s) return null;
  return SEGMENTS.find((seg) => seg.match.some((m) => s.includes(m))) ?? null;
}

/** Findings that can open a cold email: website gaps, or "no website" only when Google Places was checked. */
const SITE_FINDINGS: readonly FindingKind[] = ["whatsapp", "booking", "form", "freshness"];

/** A Google Places listing matched to this company (F49); "places-miss" rows have no place_id. */
export const isMatchedPlace = (s: { sourceChannel: string; raw: Record<string, unknown> }) => s.sourceChannel === "google_places" && typeof s.raw?.place_id === "string";

export type Eligibility =
  | { ok: true; segment: Segment; finding: FindingKind }
  | { ok: false; reason: "sector_sin_oferta" | "tipo_no_objetivo" | "sin_hallazgo" | "sin_web_no_verificada" | "correo_no_generico" | "web_por_revisar" | "web_dudosa" };

/** Organisations that do not buy for patients/clients: employee funds, cooperatives, unions, guild associations. */
const NOT_A_BUYER = /\b(fondo de empleados|cooperativa|sindicato|asociacion|agremiacion|pensionados)\b/;
export const isNotABuyer = (name: string) => NOT_A_BUYER.test(fold(name));

/**
 * F50 · Health-sector names that do not take patients: drug/device suppliers, occupational health for companies,
 * and hospitals or campuses of large institutions (a department mailbox is not a buyer).
 */
const NOT_A_CLINIC = /\b(medicamentos|dispositivos|drogueria|farmacia|farmaceutic\w*|distribuidora|fondo de droga|seguridad y salud en el trabajo|salud ocupacional|medicina laboral|servicios administrativos|financier\w*|hospital|universidad|universitari\w*|edificio)\b/;
export const isNotAClinic = (name: string) => NOT_A_CLINIC.test(fold(name));

const hostOf = (url: string | null | undefined) => {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};
/** Same site when one host is the other or a subdomain of it (clinica.co vs citas.clinica.co). */
const sameSite = (a: string, b: string) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

export function outreachEligibility(input: {
  sector: string | null | undefined;
  company: CompanyInput & { isLegalEntity: boolean };
  sources: SourceInput[];
  contacts: { type: string; sourceChannel: string | null; isGeneric?: boolean; value?: string }[];
  now?: Date;
}): Eligibility {
  const segment = segmentFor(input.sector);
  if (!segment) return { ok: false, reason: "sector_sin_oferta" };
  if (isNotABuyer(input.company.name) || (segment.id === "salud" && isNotAClinic(input.company.name))) return { ok: false, reason: "tipo_no_objetivo" };
  // Until the RNE (Ley 2300) is checked, only a company's generic mailbox (info@, contacto@). F50: never a template address.
  const generic = input.contacts.filter((c) => c.type === "email" && c.isGeneric && (c.value === undefined || isGenericEmail(c.value)));
  if (!input.company.isLegalEntity || !generic.length) return { ok: false, reason: "correo_no_generico" };
  // F50: the mailbox's own domain is the company's site. No website registered → that site must be reviewed first;
  // a registered website on another domain may belong to someone else.
  const mailDomain = generic.map((c) => ownEmailDomain(c.value)).find((d): d is string => !!d) ?? null;
  if (mailDomain) {
    const site = hostOf(input.company.website);
    if (!site) return { ok: false, reason: "web_por_revisar" };
    if (!sameSite(site, mailDomain)) return { ok: false, reason: "web_dudosa" };
  }
  const open = buildFindings(input.company, siteFactsFrom(input.sources, input.contacts), input.now ?? new Date())
    .filter((f) => f.status === "opportunity" && isFindingKind(f.id))
    .map((f) => f.id as FindingKind);
  const allowed = (k: FindingKind) => !segment.findings || segment.findings.includes(k);
  const site = PRIORITY.find((k) => SITE_FINDINGS.includes(k) && open.includes(k) && allowed(k));
  if (site) return { ok: true, segment, finding: site };
  if (open.includes("no-website") && allowed("no-website")) {
    // A registry without a website field does not prove there is no website: Google Maps must have been checked.
    // F49: a search without a matching place proves nothing; only a matched listing (place_id) does.
    return input.sources.some(isMatchedPlace) ? { ok: true, segment, finding: "no-website" } : { ok: false, reason: "sin_web_no_verificada" };
  }
  return { ok: false, reason: "sin_hallazgo" };
}

/**
 * F54 · Who may get the general services email (no finding needed): a fit legal entity with a valid generic mailbox
 * that is a buyer. Sectors without an offer use GENERAL_SEGMENT. The daily run uses it only after finding emails.
 */
export function generalEligibility(input: {
  sector: string | null | undefined;
  company: { name: string; isLegalEntity: boolean };
  contacts: { type: string; isGeneric?: boolean; value?: string }[];
}): { ok: true; segment: Segment } | { ok: false; reason: "tipo_no_objetivo" | "correo_no_generico" } {
  const segment = segmentFor(input.sector) ?? GENERAL_SEGMENT;
  if (isNotABuyer(input.company.name) || (segment.id === "salud" && isNotAClinic(input.company.name))) return { ok: false, reason: "tipo_no_objetivo" };
  const generic = input.contacts.some((c) => c.type === "email" && c.isGeneric && (c.value === undefined || isGenericEmail(c.value)));
  if (!input.company.isLegalEntity || !generic) return { ok: false, reason: "correo_no_generico" };
  return { ok: true, segment };
}
