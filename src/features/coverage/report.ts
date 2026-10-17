import type { FieldCoverage, Overlap } from "./metrics";

export type SourceId = "osm" | "rues" | "reps";

export interface SourceReport {
  source: SourceId;
  label: string;
  ok: boolean;
  error?: string;
  latencyMs?: number;
  fromCache?: boolean;
  /** Companies the source returns for the ICP (exact count when `totalIsExact`). */
  total?: number;
  totalIsExact?: boolean;
  /** Records analysed for field coverage (may be a sample). */
  analysed?: number;
  web?: FieldCoverage;
  phone?: FieldCoverage;
  email?: FieldCoverage;
  /** Emails that look like role mailboxes (info@, contacto@...). */
  genericEmail?: FieldCoverage;
  /** Legal-entity share; undefined = unknown for this source. */
  legal?: FieldCoverage;
  /** Fields the source does not expose at all. */
  notExposed?: string[];
  notes?: string[];
}

export interface IcpReport {
  id: string;
  title: string;
  sources: SourceReport[];
  overlaps: Array<{ a: SourceId; b: SourceId; overlap: Overlap }>;
  metrics?: { osmWebOrEmail: number; contact: ContactMetrics };
}

export interface CoverageRun {
  generatedAt: string;
  timeZone: string;
  icps: IcpReport[];
}

const fmtPct = (c?: FieldCoverage, notExposed = false): string =>
  notExposed ? "N/D (no expuesto)" : !c || c.pct === null ? "N/D" : `${c.pct}% (${c.withValue}/${c.of})`;
const fmtNum = (n?: number) => (n === undefined ? "N/D" : n.toLocaleString("es-CO"));

export interface ContactMetrics {
  /** (a) Contactable AND verified as legal entity: REPS generic emails + OSM places with contact matched to RUES/REPS by name. */
  verified: number;
  verifiedFromReps: number;
  verifiedFromOsm: number;
  /** (b) All contactable (OSM web/generic email + REPS generic email, deduped by name), legal status still to verify. */
  toVerify: number;
  /** False when no Colombian registry applies (Miami): (a) is not measurable. */
  verifiable: boolean;
}

export interface IcpScore {
  id: string;
  title: string;
  osmTotal: number;
  osmWebOrEmail: number;
  legalRegistry: number;
  metrics: ContactMetrics;
}

export function scoreIcp(icp: IcpReport): IcpScore {
  const osm = icp.sources.find((s) => s.source === "osm" && s.ok);
  const reps = icp.sources.find((s) => s.source === "reps" && s.ok);
  const rues = icp.sources.find((s) => s.source === "rues" && s.ok);
  return {
    id: icp.id,
    title: icp.title,
    osmTotal: osm?.total ?? 0,
    osmWebOrEmail: icp.metrics?.osmWebOrEmail ?? 0,
    legalRegistry: (rues?.total ?? 0) + (reps?.total ?? 0),
    metrics: icp.metrics?.contact ?? { verified: 0, verifiedFromReps: 0, verifiedFromOsm: 0, toVerify: 0, verifiable: false },
  };
}

const n = (x: number) => x.toLocaleString("es-CO");

export function contactTable(scores: IcpScore[]): string {
  const rows = scores.map(
    (s) =>
      `| ${s.title} | ${s.metrics.verifiable ? `**${n(s.metrics.verified)}** (${n(s.metrics.verifiedFromReps)} REPS + ${n(s.metrics.verifiedFromOsm)} OSM∩registro)` : "N/D (sin registro jurídico gratuito)"} | ${n(s.metrics.toVerify)} |`,
  );
  return [
    "| ICP | (a) Contactables verificados como persona jurídica | (b) Contactables totales por verificar |",
    "|---|---|---:|",
    ...rows,
  ].join("\n");
}

export function recommend(scores: IcpScore[]): string {
  if (!scores.length) return "No hay datos suficientes para recomendar un ICP (todas las fuentes fallaron).";
  const verifiable = scores.filter((s) => s.metrics.verifiable);
  const pool = verifiable.length ? verifiable : scores;
  const win = [...pool].sort((a, b) => b.metrics.verified - a.metrics.verified || b.metrics.toVerify - a.metrics.toVerify)[0];
  const others = pool.filter((s) => s.id !== win.id);
  const runnerUp = [...others].sort((a, b) => b.metrics.verified - a.metrics.verified)[0];
  const maxToVerify = [...scores].sort((a, b) => b.metrics.toVerify - a.metrics.toVerify)[0];
  const lines = [
    `**Recomendación (ICP principal, envíos reales): ${win.title}.**`,
    "",
    contactTable(scores),
    "",
    `Criterio: los envíos reales exigen persona jurídica verificable (SPEC §8), así que se decide por (a). ` +
      `"${win.title}" tiene ${n(win.metrics.verified)} contactables verificados` +
      (runnerUp ? ` frente a ${n(runnerUp.metrics.verified)} de "${runnerUp.title}"` : "") +
      `; ${n(win.metrics.verifiedFromReps)} vienen de correos genéricos de REPS y ${n(win.metrics.verifiedFromOsm)} de empresas OSM con web o correo que además aparecen por nombre en RUES/REPS.`,
    "",
    `(b) es el potencial tras enriquecimiento: "${maxToVerify.title}" llega a ${n(maxToVerify.metrics.toVerify)}, pero sin verificar persona jurídica` +
      `${maxToVerify.metrics.verifiable ? "" : " (Miami solo aplica a búsqueda/demo, solo correo)"}. Google Places (F05) y el enriquecimiento web (F06) deberían acercar (b) a (a).`,
  ];
  if (win.osmTotal > 0 && win.osmWebOrEmail / win.osmTotal < 0.1) {
    lines.push(
      "",
      `OJO: en OSM solo ${Math.round((win.osmWebOrEmail / win.osmTotal) * 1000) / 10}% de "${win.title}" trae web o correo genérico; el filtro "con sitio web" dependerá de F05/F06.`,
    );
  }
  lines.push(
    "",
    "Caveats: solapamiento por nombre exacto normalizado (subestima el cruce real de F07); correos genéricos por heurística (F09 la endurece); razones sociales de E.U. con apariencia de nombre propio se descartan como posible persona natural.",
  );
  return lines.join("\n");
}

export function renderReport(run: CoverageRun, scores: IcpScore[]): string {
  const out: string[] = [];
  out.push("# Prueba de cobertura de fuentes (F02)", "");
  out.push(`Generado: ${run.generatedAt} (${run.timeZone}). Datos reales consultados en vivo; nada inventado. Una fuente que falló figura como FALLÓ.`, "");
  out.push("## Resumen", "");
  out.push("| ICP | Fuente | Empresas | Web | Teléfono | Correo | Persona jurídica | Latencia |");
  out.push("|---|---|---:|---|---|---|---|---:|");
  for (const icp of run.icps) {
    for (const s of icp.sources) {
      if (!s.ok) {
        out.push(`| ${icp.title} | ${s.label} | FALLÓ | - | - | - | - | - |`);
        continue;
      }
      const ne = s.notExposed ?? [];
      out.push(
        `| ${icp.title} | ${s.label} | ${fmtNum(s.total)}${s.totalIsExact ? "" : "*"} | ${fmtPct(s.web, ne.includes("web"))} | ${fmtPct(s.phone, ne.includes("phone"))} | ${fmtPct(s.email, ne.includes("email"))} | ${s.legal ? fmtPct(s.legal) : "N/D (por verificar)"} | ${`${((s.latencyMs ?? 0) / 1000).toFixed(1)} s${s.fromCache ? " (caché)" : ""}`} |`,
      );
    }
  }
  out.push("", "\\* Conteo parcial: la consulta devolvió el máximo permitido o es una muestra.", "");
  if (scores.length) out.push("### Contactables: verificados vs por verificar", "", contactTable(scores), "");
  out.push("## Detalle por ICP", "");
  for (const icp of run.icps) {
    out.push(`### ${icp.title}`, "");
    for (const s of icp.sources) {
      if (!s.ok) {
        out.push(`- **${s.label}: FALLÓ** tras reintentos (${s.error ?? "error desconocido"}). Sin cifras para esta fuente.`);
        continue;
      }
      out.push(`- **${s.label}**: ${fmtNum(s.total)} empresas${s.analysed !== undefined && s.analysed !== s.total ? ` (porcentajes sobre ${fmtNum(s.analysed)} analizadas)` : ""}.`);
      if (s.notExposed?.length) out.push(`  - No expone: ${s.notExposed.join(", ")}.`);
      for (const n of s.notes ?? []) out.push(`  - ${n}`);
    }
    for (const o of icp.overlaps) {
      const p = o.overlap;
      out.push(
        `- **Solapamiento ${o.a.toUpperCase()} ↔ ${o.b.toUpperCase()}** (nombre normalizado, aproximado): ${p.matched} coincidencias; ${p.pctOfA ?? "N/D"}% de ${o.a.toUpperCase()} (${p.aTotal}) y ${p.pctOfB ?? "N/D"}% de ${o.b.toUpperCase()} (${p.bTotal}).`,
      );
    }
    out.push("");
  }
  out.push("## Recomendación de ICP principal", "", recommend(scores), "");
  out.push("## Metodología y límites", "");
  out.push(
    "- OSM vía Overpass: `node` + `way` con `out center tags`, bbox fijo por ciudad; dental = `amenity=dentist` ∪ `healthcare=dentist`; restaurantes = `amenity=restaurant`. Web/teléfono/correo salen de `website|contact:website|url`, `phone|contact:phone|contact:mobile`, `email|contact:email`.",
    "- RUES (`c82u-588k`): CIIU principal 8622 (odontología) / 5611 (restaurantes), `camara_comercio=BOGOTA` (el dataset no tiene municipio), `estado_matricula=ACTIVA`, excluye `PERSONA NATURAL`. El dataset no incluye teléfono, correo, web ni dirección: sirve para validar persona jurídica y NIT, no para contactar.",
    "- REPS (`c36g-9fc2`): sedes en Bogotá de IPS con NIT (excluye `Profesional Independiente`); dental se detecta por palabras en el nombre (odont, dental, sonris, smile…), por lo que puede omitir IPS con otro nombre y trae algunos falsos positivos.",
    "- Solapamiento: coincidencia exacta del nombre normalizado (sin tildes, sufijos S.A.S./LTDA/IPS y palabras genéricas); subestima el cruce real que hará F07.",
    "- Fuera del alcance de este reporte: Google Places (F05) y enriquecimiento web (F06), que subirán los % de web/correo.",
    "",
  );
  out.push("## Atribuciones", "");
  out.push("- Datos de mapa: © OpenStreetMap contributors, licencia ODbL 1.0 (https://www.openstreetmap.org/copyright).");
  out.push("- Datos de Colombia: Datos Abiertos Colombia (datos.gov.co), Cámaras de Comercio (RUES) y Ministerio de Salud (REPS), licencia CC BY-SA 4.0.");
  out.push("- Cliente: User-Agent `Faro-30XHackathon/0.1`, ≤1 consulta cada 2 s a Overpass, caché en disco.", "");
  return out.join("\n");
}

