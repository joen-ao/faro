import type { OverpassAdapter, OsmPlace, BBox } from "@/integrations/overpass/types";
import {
  CIIU, DENTAL_NAME_KEYWORDS, REPS_DATASET, REPS_FIELDS, RUES_DATASET, RUES_FIELDS,
  parseReps, parseRues, repsWhere, ruesWhere,
} from "@/integrations/socrata/datasets";
import type { SocrataAdapter } from "@/integrations/socrata/types";
import { normalizeName, fieldCoverage, isGenericEmail, nameOverlap, uniqueNames } from "./metrics";
import type { ContactMetrics, IcpReport, SourceId, SourceReport } from "./report";

export const BBOX_BOGOTA: BBox = { south: 4.45, west: -74.25, north: 4.84, east: -73.99 };
export const BBOX_MIAMI: BBox = { south: 25.7, west: -80.32, north: 25.86, east: -80.12 };

export interface IcpDef {
  id: string;
  title: string;
  osmTags: Array<Record<string, string>>;
  bbox: BBox;
  bboxLabel: string;
  rues?: { ciiu: string; camara: string };
  reps?: { municipio: string; dental: boolean };
}

export const ICPS: IcpDef[] = [
  {
    id: "dental-bogota",
    title: "Clínicas odontológicas · Bogotá",
    osmTags: [{ amenity: "dentist" }, { healthcare: "dentist" }],
    bbox: BBOX_BOGOTA,
    bboxLabel: "bbox Bogotá 4.45,-74.25,4.84,-73.99 (incluye parte de Soacha/Chía)",
    rues: { ciiu: CIIU.dental, camara: "BOGOTA" },
    reps: { municipio: "BOGOT", dental: true },
  },
  {
    id: "restaurants-bogota",
    title: "Restaurantes · Bogotá",
    osmTags: [{ amenity: "restaurant" }],
    bbox: BBOX_BOGOTA,
    bboxLabel: "bbox Bogotá 4.45,-74.25,4.84,-73.99 (incluye parte de Soacha/Chía)",
    rues: { ciiu: CIIU.restaurants, camara: "BOGOTA" },
  },
  {
    id: "restaurants-miami",
    title: "Restaurantes · Miami",
    osmTags: [{ amenity: "restaurant" }],
    bbox: BBOX_MIAMI,
    bboxLabel: "bbox Miami 25.70,-80.32,25.86,-80.12 (Miami, Miami Beach, Coral Gables y alrededores)",
  },
];

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

export interface SourceOutcome {
  report: SourceReport;
  names: string[];
  osmWebOrEmail?: number;
  /** OSM: names of places with website or generic email. REPS: names of sites with generic email. */
  contactNames?: string[];
}

export async function runOsm(icp: IcpDef, overpass: OverpassAdapter): Promise<SourceOutcome> {
  const label = "OpenStreetMap (Overpass)";
  try {
    const r = await overpass.search({ tags: icp.osmTags, bbox: icp.bbox, timeoutSec: 120 });
    const places: OsmPlace[] = r.places;
    const webOrEmail = places.filter((p) => p.website || isGenericEmail(p.email)).length;
    return {
      names: places.map((p) => p.name ?? ""),
      osmWebOrEmail: webOrEmail,
      contactNames: places.filter((p) => p.website || isGenericEmail(p.email)).map((p) => p.name ?? ""),
      report: {
        source: "osm", label, ok: true, latencyMs: r.latencyMs, fromCache: r.fromCache,
        total: places.length, totalIsExact: true, analysed: places.length,
        web: fieldCoverage(places, (p) => p.website),
        phone: fieldCoverage(places, (p) => p.phone),
        email: fieldCoverage(places, (p) => p.email),
        genericEmail: fieldCoverage(places, (p) => isGenericEmail(p.email)),
        notes: [
          `Área: ${icp.bboxLabel}. Servidor: ${new URL(r.endpoint).host}.`,
          `Con nombre: ${places.filter((p) => p.name).length} de ${places.length}; con web o correo genérico: ${webOrEmail}.`,
          "Persona jurídica: no se puede saber desde OSM (por verificar contra RUES/REPS).",
        ],
      },
    };
  } catch (e) {
    return { names: [], report: { source: "osm", label, ok: false, error: errMsg(e) } };
  }
}

export async function runRues(icp: IcpDef, socrata: SocrataAdapter, socrataNoCache: SocrataAdapter = socrata): Promise<SourceOutcome | undefined> {
  if (!icp.rues) return undefined;
  const label = "RUES (datos.gov.co)";
  try {
    const where = ruesWhere(icp.rues);
    const anyNature = where.replace(" AND organizacion_juridica!='PERSONA NATURAL'", "");
    const [legal, all] = await Promise.all([socrata.count(RUES_DATASET, where), socrata.count(RUES_DATASET, anyNature)]);
    // Company names are pulled without disk cache so possible natural-person names never land in .cache.
    const rows = await socrataNoCache.queryAll(RUES_DATASET, { select: RUES_FIELDS, where }, { pageSize: 25_000, maxRows: 150_000 });
    const parsed = parseRues(rows.rows);
    const flagged = parsed.filter((c) => c.possibleNaturalPerson).length;
    const companies = parsed.filter((c) => !c.possibleNaturalPerson);
    return {
      names: companies.map((c) => c.razonSocial),
      report: {
        source: "rues", label, ok: true, latencyMs: legal.latencyMs + all.latencyMs + rows.latencyMs, fromCache: rows.fromCache,
        total: legal.count, totalIsExact: true, analysed: companies.length,
        legal: { withValue: legal.count, of: all.count, pct: all.count ? Math.round((legal.count / all.count) * 1000) / 10 : null },
        notExposed: ["web", "phone", "email"],
        notes: [
          `CIIU ${icp.rues.ciiu}, cámara ${icp.rues.camara}, matrícula ACTIVA. El dataset no tiene municipio: la cámara de comercio es la aproximación geográfica.`,
          `Persona jurídica: ${legal.count.toLocaleString("es-CO")} de ${all.count.toLocaleString("es-CO")} matrículas activas (el resto son personas naturales, excluidas).`,
          `Posible persona natural / por verificar: ${flagged} razones sociales de E.U. con apariencia de nombre propio (${flagged && parsed.length ? Math.round((flagged / parsed.length) * 1000) / 10 : 0}% de la muestra); quedan fuera de solapamiento y de contactables. El % jurídico las incluye.`,
          "Solo sirve para validar persona jurídica/NIT y para dedupe: no trae teléfono, correo ni web.",
        ],
      },
    };
  } catch (e) {
    return { names: [], report: { source: "rues", label, ok: false, error: errMsg(e) } };
  }
}

export async function runReps(icp: IcpDef, socrata: SocrataAdapter): Promise<SourceOutcome | undefined> {
  if (!icp.reps) return undefined;
  const label = "REPS (datos.gov.co)";
  try {
    const kw = icp.reps.dental ? DENTAL_NAME_KEYWORDS : undefined;
    const where = repsWhere({ municipio: icp.reps.municipio, nameKeywords: kw });
    // Same filter but any class/id type, to measure the legal-entity share.
    const anyKind = where
      .replace(" AND claseprestador like 'Instituciones Prestadoras%'", "")
      .replace(" AND tipoid='NI'", "");
    const [legal, all] = await Promise.all([socrata.count(REPS_DATASET, where), socrata.count(REPS_DATASET, anyKind)]);
    const rows = await socrata.queryAll(REPS_DATASET, { select: REPS_FIELDS, where }, { pageSize: 10_000, maxRows: 50_000 });
    const providers = parseReps(rows.rows);
    const distinct = new Set(providers.map((p) => p.nit).filter(Boolean)).size;
    return {
      names: providers.map((p) => p.name),
      contactNames: providers.filter((p) => isGenericEmail(p.email)).map((p) => p.name),
      report: {
        source: "reps", label, ok: true, latencyMs: legal.latencyMs + all.latencyMs + rows.latencyMs, fromCache: rows.fromCache,
        total: providers.length, totalIsExact: legal.count === providers.length, analysed: providers.length,
        phone: fieldCoverage(providers, (p) => p.phone),
        email: fieldCoverage(providers, (p) => p.email),
        genericEmail: fieldCoverage(providers, (p) => isGenericEmail(p.email)),
        legal: { withValue: legal.count, of: all.count, pct: all.count ? Math.round((legal.count / all.count) * 1000) / 10 : null },
        notExposed: ["web"],
        notes: [
          `Sedes de IPS con NIT en Bogotá cuyo nombre contiene: ${DENTAL_NAME_KEYWORDS.join(", ")}. ${distinct} NIT distintos, ${uniqueNames(providers.map((p) => p.name))} nombres de sede distintos.`,
          `Persona jurídica: ${legal.count} de ${all.count} prestadores con ese nombre (el resto son profesionales independientes/personas naturales, excluidos).`,
          `Correos de REPS con apariencia genérica (info@, contacto@, citas@…): ${providers.filter((p) => isGenericEmail(p.email)).length} de ${providers.length}; los demás parecen personales y no se cuentan como contactables.`,
        ],
      },
    };
  } catch (e) {
    return { names: [], report: { source: "reps", label, ok: false, error: errMsg(e) } };
  }
}

export async function runIcp(
  icp: IcpDef,
  deps: { overpass: OverpassAdapter; socrata: SocrataAdapter; socrataNoCache?: SocrataAdapter },
): Promise<{ report: IcpReport; osmWebOrEmail: number }> {
  const osm = await runOsm(icp, deps.overpass);
  const rues = await runRues(icp, deps.socrata, deps.socrataNoCache);
  const reps = await runReps(icp, deps.socrata);
  const outcomes = [osm, rues, reps].filter((o): o is SourceOutcome => !!o);
  const overlaps: IcpReport["overlaps"] = [];
  const pair = (a: SourceId, b: SourceId, x?: SourceOutcome, y?: SourceOutcome) => {
    if (x?.report.ok && y?.report.ok) overlaps.push({ a, b, overlap: nameOverlap(x.names, y.names) });
  };
  pair("osm", "rues", osm, rues);
  pair("osm", "reps", osm, reps);
  const sources = outcomes.map((o) => o.report);
  if (!icp.rues && !icp.reps) {
    osm.report.notes = [...(osm.report.notes ?? []), "RUES y REPS solo cubren Colombia: no aplican a Miami."];
  }
  const contact = contactMetrics(osm, rues, reps);
  return {
    report: { id: icp.id, title: icp.title, sources, overlaps, metrics: { osmWebOrEmail: osm.osmWebOrEmail ?? 0, contact } },
    osmWebOrEmail: osm.osmWebOrEmail ?? 0,
  };
}

/**
 * (a) verified = REPS sites with generic email + OSM places with contact whose normalized name is in
 * RUES/REPS (not already counted via REPS). (b) toVerify = OSM with contact + REPS generic, deduped by name.
 */
export function contactMetrics(osm: SourceOutcome, rues?: SourceOutcome, reps?: SourceOutcome): ContactMetrics {
  const norm = (xs: string[]) => new Set(xs.map(normalizeName).filter(Boolean));
  const osmContact = osm.report.ok ? osm.contactNames ?? [] : [];
  const repsGeneric = reps?.report.ok ? norm(reps.contactNames ?? []) : new Set<string>();
  const registry = norm([...(rues?.report.ok ? rues.names : []), ...(reps?.report.ok ? reps.names : [])]);
  const verifiable = !!(rues?.report.ok || reps?.report.ok);
  const osmNames = osmContact.map(normalizeName);
  const verifiedFromOsm = verifiable ? osmNames.filter((x) => x && registry.has(x) && !repsGeneric.has(x)).length : 0;
  const osmInGeneric = osmNames.filter((x) => x && repsGeneric.has(x)).length;
  return {
    verifiable,
    verifiedFromReps: repsGeneric.size,
    verifiedFromOsm,
    verified: repsGeneric.size + verifiedFromOsm,
    toVerify: osmContact.length + repsGeneric.size - osmInGeneric,
  };
}
