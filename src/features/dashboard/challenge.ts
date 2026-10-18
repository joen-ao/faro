import { sql } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import type { ComplianceMetrics } from "@/features/compliance/metrics";
import type { MetricsBucket } from "@/features/metrics/channels";
import { contactLabel, fmtInt, fmtPct, fmtUsd, sourceLabel } from "./format";

/** Public sources that cost nothing to query (Google Places is a paid API with a free tier, so it is not counted here). */
export const FREE_PUBLIC_SOURCES = ["osm", "rues", "reps", "website"] as const;

export type ChallengeStatus = "done" | "progress" | "pending";

export interface ChallengeItem {
  id: string;
  group: "required" | "desired";
  /** Requirement as written in the brief (SPEC §1, 08). */
  requirement: string;
  status: ChallengeStatus;
  /** The live number, short. */
  value: string;
  /** One line explaining the number. */
  detail: string;
  href?: string;
}

/** Facts read from the persistent DB, real data only (no demo company/lead, no mock source). */
export interface ChallengeFacts {
  /** Companies with a real lead per source channel. */
  companiesBySource: { source: string; companies: number }[];
  uniqueCompanies: number;
  /** Merged duplicate pairs stored by dedupe on hunts with real leads (mock pairs excluded). */
  mergedDuplicates: number;
  /** Records discarded while searching because they looked like natural persons. */
  excludedPersons: number;
  /** Real leads with a Dapta qualification. */
  daptaQualified: number;
  /** Real leads with any Dapta qualification (qualified or not). */
  daptaEvaluated: number;
}

async function rows<T>(db: AppDb, q: ReturnType<typeof sql>): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as T[] | { rows: T[] };
  return Array.isArray(r) ? r : r.rows;
}

export async function queryChallengeFacts(db: AppDb): Promise<ChallengeFacts> {
  const realCompany = sql`not c.is_demo and exists (select 1 from leads l where l.company_id = c.id and not l.is_demo)`;
  const bySource = await rows<{ source: string; companies: number }>(
    db,
    sql`select cs.source_channel::text as source, count(distinct cs.company_id)::int as companies
        from company_sources cs join companies c on c.id = cs.company_id
        where not cs.is_mock and ${realCompany}
        group by 1 order by 2 desc`,
  );
  const [u] = await rows<{ n: number }>(db, sql`select count(*)::int as n from companies c where ${realCompany}`);
  const [h] = await rows<{ merged: number; excluded: number }>(
    db,
    sql`select
          coalesce(sum((select count(*) from jsonb_array_elements(coalesce(h.progress->'dedupe'->'pairs', '[]'::jsonb)) p
                        where coalesce((p->>'isMock')::boolean, false) = false)), 0)::int as merged,
          coalesce(sum(coalesce((h.progress->>'excludedPersonal')::int, 0)), 0)::int as excluded
        from hunts h
        where exists (select 1 from leads l where l.hunt_id = h.id and not l.is_demo)`,
  );
  const [q] = await rows<{ qualified: number; evaluated: number }>(
    db,
    sql`select count(distinct q.lead_id) filter (where q.qualified)::int as qualified, count(distinct q.lead_id)::int as evaluated
        from qualifications q join leads l on l.id = q.lead_id
        where q.origin = 'dapta' and not q.is_mock and not q.is_demo and not l.is_demo`,
  );
  return {
    companiesBySource: bySource.map((r) => ({ source: r.source, companies: Number(r.companies) })),
    uniqueCompanies: Number(u?.n ?? 0),
    mergedDuplicates: Number(h?.merged ?? 0),
    excludedPersons: Number(h?.excluded ?? 0),
    daptaQualified: Number(q?.qualified ?? 0),
    daptaEvaluated: Number(q?.evaluated ?? 0),
  };
}

const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n === 1 ? one : many}`;

/** Honest status per brief requirement: "done" only when the real numbers prove it. */
export function buildChallenge(f: ChallengeFacts, real: MetricsBucket, c: ComplianceMetrics): ChallengeItem[] {
  const t = real.totals;
  const free = f.companiesBySource.filter((s) => (FREE_PUBLIC_SOURCES as readonly string[]).includes(s.source) && s.companies > 0);
  const others = f.companiesBySource.filter((s) => !free.includes(s) && s.companies > 0);
  const channelsWithCpl = real.byContact.filter((r) => r.cpl !== null);
  const channelsQualified = real.byContact.filter((r) => r.qualified > 0);
  const cplc = real.byContact.filter((r) => r.cplc !== null);

  return [
    {
      id: "sources",
      group: "required",
      requirement: "Buscar leads en al menos 2 fuentes públicas y gratuitas",
      status: free.length >= 2 ? "done" : free.length === 1 ? "progress" : "pending",
      value: plural(free.length, "fuente", "fuentes"),
      detail: free.length
        ? `${free.map((s) => `${sourceLabel(s.source)} (${fmtInt(s.companies)})`).join(" · ")}${others.length ? ` · además ${others.map((s) => sourceLabel(s.source)).join(", ")}` : ""}`
        : "Ninguna fuente gratuita con leads reales todavía",
    },
    {
      id: "dedupe",
      group: "required",
      requirement: "Guardar todo en un solo lugar y quitar duplicados",
      status: f.uniqueCompanies > 0 ? "done" : "pending",
      value: plural(f.uniqueCompanies, "empresa única", "empresas únicas"),
      detail: `${plural(f.mergedDuplicates, "duplicado fusionado", "duplicados fusionados")} en una sola base`,
    },
    {
      id: "icp",
      group: "required",
      requirement: "Filtrar los leads que encajan con el perfil de cliente ideal",
      status: t.fit > 0 ? "done" : t.found > 0 ? "progress" : "pending",
      value: `${fmtInt(t.fit)} de ${fmtInt(t.found)}`,
      detail: t.found ? `${fmtPct(t.fit / t.found)} de los leads encontrados encaja con el perfil` : "Sin leads reales todavía",
    },
    {
      id: "outreach",
      group: "required",
      requirement: "Enviar un primer mensaje y registrar la respuesta",
      status: t.contacted > 0 && t.responded > 0 ? "done" : t.contacted > 0 ? "progress" : "pending",
      value: plural(t.contacted, "enviado", "enviados"),
      detail: `${plural(t.opened, "abrió", "abrieron")} su diagnóstico · ${plural(t.responded, "respondió", "respondieron")}`,
    },
    {
      id: "dashboard",
      group: "required",
      requirement: "Mostrar un tablero con leads y CPL por canal",
      status: t.found > 0 && channelsWithCpl.length > 0 ? "done" : t.found > 0 ? "progress" : "pending",
      value: plural(channelsWithCpl.length, "canal con CPL", "canales con CPL"),
      detail: channelsWithCpl.length
        ? channelsWithCpl.map((r) => `${contactLabel(r.contact)} ${fmtUsd(r.cpl)}`).join(" · ")
        : "El CPL aparece cuando un canal tiene leads del perfil y costo",
      href: "#r-matrix",
    },
    {
      id: "public-data",
      group: "required",
      requirement: "Usar solo datos públicos de empresas, respetando términos y ley",
      status: c.naturalPersonsContacted === 0 ? "done" : "pending",
      value: `${fmtInt(c.naturalPersonsContacted)} personas naturales contactadas`,
      detail: `${plural(f.excludedPersons, "registro de persona natural excluido", "registros de persona natural excluidos")} al buscar · ${fmtInt(c.optOutsRespected)} de ${fmtInt(c.optOutsTotal)} bajas respetadas`,
      href: "#compliance",
    },
    {
      id: "dapta",
      group: "desired",
      requirement: "Enviar los leads al agente de Dapta para que los califique",
      status: f.daptaEvaluated > 0 ? "done" : t.chatted > 0 || t.opened > 0 ? "progress" : "pending",
      value: plural(f.daptaEvaluated, "lead evaluado", "leads evaluados"),
      detail: `${plural(t.chatted, "conversó", "conversaron")} con el agente · ${plural(f.daptaQualified, "calificado", "calificados")} por Dapta`,
    },
    {
      id: "qualified-rate",
      group: "desired",
      requirement: "Comparar canales por CPL y por % de leads calificados",
      status: channelsQualified.length > 0 ? "done" : t.fit > 0 ? "progress" : "pending",
      value: t.fit ? fmtPct(t.qualified / t.fit) : "—",
      detail: real.byContact.length
        ? real.byContact.map((r) => `${contactLabel(r.contact)} ${r.fit ? fmtPct(r.qualified / r.fit) : "—"}`).join(" · ")
        : "Sin canales con contactos todavía",
    },
    {
      id: "cplc",
      group: "desired",
      requirement: "Calcular el costo por lead calificado (CPLC) de cada canal",
      status: cplc.length > 0 ? "done" : t.costUsd > 0 ? "progress" : "pending",
      value: t.cplc === null ? "n/d" : fmtUsd(t.cplc),
      detail: cplc.length ? cplc.map((r) => `${contactLabel(r.contact)} ${fmtUsd(r.cplc)}`).join(" · ") : "Aparece con el primer lead calificado",
    },
  ];
}
