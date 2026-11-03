import { sql } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import { wilson } from "@/features/copilot/stats";

/**
 * F31 · Business dashboard numbers for one period (7/30/90 days) and the previous one of equal length.
 * "Real" follows F13: no demo leads, no mock/demo costs, events or qualifications, no mock messages.
 * Every query is set-based (one pass per table) and they run one after another: in production the
 * Supabase transaction pooler hung when these ran in parallel.
 */

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];
export const parseRange = (v: string | undefined | null): RangeDays => {
  const n = Number(v);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 30;
};

/** Outbound (Faro prospecting) sources; `meta_ads` is paid inbound. `sample` belongs to neither. */
export const FARO_SOURCES = ["osm", "rues", "reps", "google_places", "website", "secop", "rnt", "solidaria"] as const;
export type Group = "meta" | "faro";

/** Sample sizes per side for comparing qualification (playbook): directional read and formal read. */
export const MIN_DIRECTIONAL = 20;
export const MIN_FORMAL = 78;
/** Below these a KPI is shown with "pocos datos". */
export const MIN_RATE_N = 20;
export const MIN_QUALIFIED = 3;
export const MIN_LEADS = 5;
/** Relative CPQL gap under which both groups are a tie. */
export const TIE_GAP = 0.1;

export interface Interval {
  low: number;
  high: number;
}

export interface Kpi {
  key: "qualified" | "cpql" | "cpl" | "rate" | "spend" | "newLeads";
  value: number | null;
  prev: number | null;
  /** Relative change vs previous period (rate: absolute change in points, 0..1). Null when not comparable. */
  delta: number | null;
  /** Sample behind the number (denominator), for "pocos datos". */
  n: number;
  lowSample: boolean;
  interval: Interval | null;
  /** One value per trend week (null = not computable that week). */
  series: (number | null)[];
}

export interface GroupMetrics {
  group: Group;
  spendUsd: number;
  /** Meta: leads that arrived in the period. Faro: leads first contacted in the period. */
  leads: number;
  /** Meta: ad clicks (ad_spend) in the period. Faro: same as leads (contacted). */
  reach: number;
  responded: number;
  qualified: number;
  rate: number | null;
  interval: Interval | null;
  cpl: number | null;
  cpql: number | null;
  medianHoursToResponse: number | null;
}

export type VerdictConfidence = "insuficiente" | "baja" | "media" | "alta";
export interface Verdict {
  kind: "insufficient" | "tie" | "winner";
  winner: Group | null;
  confidence: VerdictConfidence;
  text: string;
}

export interface TrendWeek {
  /** Monday (yyyy-mm-dd, Bogotá). */
  week: string;
  meta: { leads: number; qualified: number };
  faro: { leads: number; qualified: number };
}

export interface FunnelStep {
  key: "found" | "fit" | "contacted" | "responded" | "qualified";
  value: number;
  /** Conversion from the previous step (null on the first step or when the previous is 0). */
  stepRate: number | null;
}

export interface BusinessMetrics {
  rangeDays: number;
  periodStart: string;
  periodEnd: string;
  prevStart: string;
  weeks: string[];
  kpis: Record<Kpi["key"], Kpi>;
  groups: Record<Group, GroupMetrics>;
  verdict: Verdict;
  trend: TrendWeek[];
  funnel: Record<Group, FunnelStep[]>;
}

/* ---------------- helpers ---------------- */

async function rows<T>(db: AppDb, q: ReturnType<typeof sql>): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as T[] | { rows: T[] };
  return Array.isArray(r) ? r : r.rows;
}
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const DAY = 86_400_000;
const BOGOTA_OFFSET = 5 * 3600_000; // Colombia: UTC-5, no DST

/** Monday (yyyy-mm-dd) of the Bogotá week containing `d`. */
export function bogotaWeek(d: Date): string {
  const local = new Date(d.getTime() - BOGOTA_OFFSET);
  const dow = (local.getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow)).toISOString().slice(0, 10);
}

/** Weeks shown in the trend and sparklines: those overlapping the period, at least 4. */
export function trendWeeks(now: Date, rangeDays: number): string[] {
  const first = bogotaWeek(new Date(now.getTime() - Math.max(rangeDays, 28) * DAY));
  const last = bogotaWeek(now);
  const out: string[] = [];
  for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${last}T00:00:00Z`); t += 7 * DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** UTC instant where a Bogotá Monday starts. */
const weekStartUtc = (week: string) => new Date(Date.parse(`${week}T00:00:00Z`) + BOGOTA_OFFSET);

const relDelta = (cur: number | null, prev: number | null) => (cur === null || prev === null || prev === 0 ? null : (cur - prev) / prev);
const toInterval = (k: number, n: number): Interval | null => wilson(k, n);

const GROUP_SQL = `case when l.primary_source = 'meta_ads' then 'meta' when l.primary_source::text in (${FARO_SOURCES.map((s) => `'${s}'`).join(",")}) then 'faro' end`;
const WEEK_SQL = (col: string) => `to_char(date_trunc('week', (${col} at time zone 'UTC') - interval '5 hours'), 'YYYY-MM-DD')`;

/**
 * Group cohort entering in [from, to): Meta = meta_ads leads created then; Faro = outbound leads whose first
 * real message (sent/delivered, not mock) went out then. Each lead appears once, with its entry time.
 */
const COHORT = (from: string, to: string) => `
mfirst as (
  select m.lead_id, min(coalesce(m.sent_at, m.created_at)) as at
  from messages m
  where m.status in ('sent','delivered') and not m.is_mock
  group by m.lead_id
),
coh as (
  select l.id, 'meta'::text as grp, l.created_at as entered_at
  from leads l
  where not l.is_demo and l.primary_source = 'meta_ads' and l.created_at >= ${from} and l.created_at < ${to}
  union all
  select l.id, 'faro'::text as grp, mf.at as entered_at
  from mfirst mf join leads l on l.id = mf.lead_id
  where not l.is_demo and ${GROUP_SQL} = 'faro' and mf.at >= ${from} and mf.at < ${to}
),
resp as (
  -- first real response after entry. Meta leads arrive through a form, so only a reply/chat counts for them.
  select c.id, min(e.at) as at
  from coh c join events e on e.lead_id = c.id
  where not (e.is_mock or e.is_demo) and e.at >= c.entered_at
    and (e.type in ('reply','widget_chat') or (c.grp = 'faro' and e.type = 'form_submit'))
  group by c.id
),
qual as (
  select c.id, bool_or(q.qualified) as ok
  from coh c join qualifications q on q.lead_id = c.id
  where not (q.is_mock or q.is_demo)
  group by c.id
)`;

/* ---------------- queries ---------------- */

interface Totals {
  newLeads: number;
  spend: number;
  evaluated: number;
  qualified: number;
}

async function periodTotals(db: AppDb, from: Date, to: Date): Promise<Totals> {
  const f = from.toISOString();
  const t = to.toISOString();
  const [r] = await rows<Record<string, unknown>>(
    db,
    sql`select
  (select count(*) from leads l where not l.is_demo and l.created_at >= ${f}::timestamptz and l.created_at < ${t}::timestamptz)::int as "newLeads",
  (select coalesce(sum(c.usd), 0) from cost_entries c left join leads l on l.id = c.lead_id
     where not (c.is_mock or c.is_demo) and not coalesce(l.is_demo, false) and c.at >= ${f}::timestamptz and c.at < ${t}::timestamptz)::float8 as spend,
  (select count(*) from (select q.lead_id, bool_or(q.qualified) as ok from qualifications q join leads l on l.id = q.lead_id
     where not (q.is_mock or q.is_demo) and not l.is_demo and q.created_at >= ${f}::timestamptz and q.created_at < ${t}::timestamptz group by q.lead_id) x)::int as evaluated,
  (select count(*) from (select q.lead_id from qualifications q join leads l on l.id = q.lead_id
     where not (q.is_mock or q.is_demo) and not l.is_demo and q.qualified and q.created_at >= ${f}::timestamptz and q.created_at < ${t}::timestamptz group by q.lead_id) x)::int as qualified`,
  );
  return { newLeads: num(r?.newLeads), spend: num(r?.spend), evaluated: num(r?.evaluated), qualified: num(r?.qualified) };
}

async function weeklyTotals(db: AppDb, from: Date, to: Date): Promise<Map<string, Totals>> {
  const f = from.toISOString();
  const t = to.toISOString();
  const res = await rows<{ wk: string; kind: string; v: unknown }>(
    db,
    sql.raw(`
select ${WEEK_SQL("l.created_at")} as wk, 'newLeads' as kind, count(*)::float8 as v
from leads l where not l.is_demo and l.created_at >= '${f}'::timestamptz and l.created_at < '${t}'::timestamptz group by 1
union all
select ${WEEK_SQL("c.at")}, 'spend', coalesce(sum(c.usd), 0)::float8
from cost_entries c left join leads l on l.id = c.lead_id
where not (c.is_mock or c.is_demo) and not coalesce(l.is_demo, false) and c.at >= '${f}'::timestamptz and c.at < '${t}'::timestamptz group by 1
union all
select wk, 'evaluated', count(*)::float8 from (
  select ${WEEK_SQL("q.created_at")} as wk, q.lead_id from qualifications q join leads l on l.id = q.lead_id
  where not (q.is_mock or q.is_demo) and not l.is_demo and q.created_at >= '${f}'::timestamptz and q.created_at < '${t}'::timestamptz group by 1, 2
) x group by wk
union all
select wk, 'qualified', count(*)::float8 from (
  select ${WEEK_SQL("q.created_at")} as wk, q.lead_id from qualifications q join leads l on l.id = q.lead_id
  where not (q.is_mock or q.is_demo) and not l.is_demo and q.qualified and q.created_at >= '${f}'::timestamptz and q.created_at < '${t}'::timestamptz group by 1, 2
) x group by wk`),
  );
  const out = new Map<string, Totals>();
  for (const r of res) {
    const cur = out.get(r.wk) ?? { newLeads: 0, spend: 0, evaluated: 0, qualified: 0 };
    cur[r.kind as keyof Totals] = num(r.v);
    out.set(r.wk, cur);
  }
  return out;
}

interface GroupRaw {
  grp: Group;
  n: number;
  responded: number;
  qualified: number;
  median_h: number | null;
}

async function groupCohort(db: AppDb, from: Date, to: Date): Promise<GroupRaw[]> {
  const f = `'${from.toISOString()}'::timestamptz`;
  const t = `'${to.toISOString()}'::timestamptz`;
  return rows<GroupRaw>(
    db,
    sql.raw(`with ${COHORT(f, t)}
select c.grp, count(*)::int as n, count(r.id)::int as responded, (count(*) filter (where qa.ok))::int as qualified,
  percentile_cont(0.5) within group (order by extract(epoch from (r.at - c.entered_at)) / 3600.0) as median_h
from coh c left join resp r on r.id = c.id left join qual qa on qa.id = c.id
group by c.grp`),
  );
}

async function groupSpend(db: AppDb, from: Date, to: Date): Promise<Map<Group, number>> {
  const res = await rows<{ grp: Group | null; usd: unknown }>(
    db,
    sql.raw(`
select case when coalesce(c.source_channel::text, l.primary_source::text) = 'meta_ads' then 'meta'
  when coalesce(c.source_channel::text, l.primary_source::text) in (${FARO_SOURCES.map((s) => `'${s}'`).join(",")}) then 'faro' end as grp,
  coalesce(sum(c.usd), 0)::float8 as usd
from cost_entries c left join leads l on l.id = c.lead_id
where not (c.is_mock or c.is_demo) and not coalesce(l.is_demo, false)
  and c.at >= '${from.toISOString()}'::timestamptz and c.at < '${to.toISOString()}'::timestamptz
group by 1`),
  );
  return new Map(res.filter((r) => r.grp).map((r) => [r.grp as Group, num(r.usd)]));
}

async function metaClicks(db: AppDb, from: Date, to: Date): Promise<number> {
  const day = (d: Date) => new Date(d.getTime() - BOGOTA_OFFSET).toISOString().slice(0, 10);
  const [r] = await rows<{ clicks: unknown }>(
    db,
    sql`select coalesce(sum(clicks), 0)::int as clicks from ad_spend where platform = 'meta' and not is_demo and date >= ${day(from)} and date <= ${day(to)}`,
  );
  return num(r?.clicks);
}

async function groupTrend(db: AppDb, from: Date, to: Date): Promise<{ wk: string; grp: Group; n: number; qualified: number }[]> {
  const f = `'${from.toISOString()}'::timestamptz`;
  const t = `'${to.toISOString()}'::timestamptz`;
  return rows(
    db,
    sql.raw(`with ${COHORT(f, t)}
select ${WEEK_SQL("c.entered_at")} as wk, c.grp, count(*)::int as n, (count(*) filter (where qa.ok))::int as qualified
from coh c left join qual qa on qa.id = c.id
group by 1, 2`),
  );
}

/** Creation cohort per group: found -> profile fit -> contacted -> responded -> qualified. */
async function groupFunnel(db: AppDb, from: Date, to: Date): Promise<Record<string, unknown>[]> {
  const f = `'${from.toISOString()}'::timestamptz`;
  const t = `'${to.toISOString()}'::timestamptz`;
  return rows(
    db,
    sql.raw(`
with lp as (
  select l.id, ${GROUP_SQL} as grp, coalesce(l.fit_score >= coalesce(i.threshold, 60), false) as fit
  from leads l
  left join hunts h on h.id = l.hunt_id
  left join icp_profiles i on i.id = h.icp_profile_id
  where not l.is_demo and l.created_at >= ${f} and l.created_at < ${t}
),
lpg as (select * from lp where grp is not null),
mf as (
  select distinct m.lead_id from messages m join lpg on lpg.id = m.lead_id
  where m.status in ('sent','delivered') and not m.is_mock
),
rs as (
  select distinct e.lead_id from events e join lpg on lpg.id = e.lead_id
  where not (e.is_mock or e.is_demo) and (e.type in ('reply','widget_chat') or (lpg.grp = 'faro' and e.type = 'form_submit'))
),
qa as (
  select q.lead_id from qualifications q join lpg on lpg.id = q.lead_id
  where not (q.is_mock or q.is_demo) group by q.lead_id having bool_or(q.qualified)
)
select lpg.grp,
  count(*)::int as found,
  (count(*) filter (where lpg.fit))::int as fit,
  (count(*) filter (where lpg.grp = 'meta' or mf.lead_id is not null))::int as contacted,
  (count(rs.lead_id))::int as responded,
  (count(qa.lead_id))::int as qualified
from lpg
left join mf on mf.lead_id = lpg.id
left join rs on rs.lead_id = lpg.id
left join qa on qa.lead_id = lpg.id
group by lpg.grp`),
  );
}

/* ---------------- pure builders ---------------- */

export function buildGroup(group: Group, raw: GroupRaw | undefined, spendUsd: number, clicks: number): GroupMetrics {
  const leads = raw?.n ?? 0;
  const qualified = raw?.qualified ?? 0;
  return {
    group,
    spendUsd,
    leads,
    reach: group === "meta" ? clicks : leads,
    responded: raw?.responded ?? 0,
    qualified,
    rate: div(qualified, leads),
    interval: toInterval(qualified, leads),
    cpl: div(spendUsd, leads),
    cpql: div(spendUsd, qualified),
    medianHoursToResponse: raw?.median_h === null || raw?.median_h === undefined ? null : Number(raw.median_h),
  };
}

const GROUP_NAME: Record<Group, string> = { meta: "Meta", faro: "Faro" };
const usd = (n: number) => `USD ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Which group gets a qualified lead cheaper, honest about sample size (thresholds of the playbook). */
export function buildVerdict(meta: GroupMetrics, faro: GroupMetrics): Verdict {
  if (meta.leads < MIN_DIRECTIONAL || faro.leads < MIN_DIRECTIONAL) {
    return {
      kind: "insufficient",
      winner: null,
      confidence: "insuficiente",
      text: `Datos insuficientes para comparar: Meta tiene ${meta.leads} leads y Faro ${faro.leads} contactados en el período. Se necesitan al menos ${MIN_DIRECTIONAL} por lado para una lectura direccional.`,
    };
  }
  if (meta.qualified === 0 && faro.qualified === 0) {
    return { kind: "insufficient", winner: null, confidence: "insuficiente", text: "Datos insuficientes: ninguno de los dos tiene leads calificados en el período." };
  }
  // No qualified lead: its cost per qualified lead is unbounded (worse than any finite one).
  const eff = (g: GroupMetrics) => (g.qualified > 0 ? g.spendUsd / g.qualified : Number.POSITIVE_INFINITY);
  const a = eff(meta);
  const b = eff(faro);
  const formal = meta.leads >= MIN_FORMAL && faro.leads >= MIN_FORMAL;
  const lo = Math.min(a, b);
  if (Number.isFinite(a) && Number.isFinite(b) && (lo === 0 ? a === b : Math.abs(a - b) / lo < TIE_GAP)) {
    return {
      kind: "tie",
      winner: null,
      confidence: formal ? "media" : "baja",
      text: `Empate: el lead calificado cuesta ${usd(meta.cpql ?? 0)} en Meta y ${usd(faro.cpql ?? 0)} en Faro (menos de ${Math.round(TIE_GAP * 100)} % de diferencia).`,
    };
  }
  const winner: Group = a <= b ? "meta" : "faro";
  const w = winner === "meta" ? meta : faro;
  const l = winner === "meta" ? faro : meta;
  const disjoint = !!(w.interval && l.interval && (w.interval.low > l.interval.high || l.interval.low > w.interval.high));
  const confidence: VerdictConfidence = formal ? (disjoint ? "alta" : "media") : "baja";
  const loser = l.qualified > 0 ? `${usd(l.cpql ?? 0)} en ${GROUP_NAME[l.group]}` : `${GROUP_NAME[l.group]} sin calificados todavía`;
  const why =
    confidence === "baja"
      ? `Confianza baja: lectura direccional, con menos de ${MIN_FORMAL} leads por lado.`
      : confidence === "media"
        ? "Confianza media: muestra suficiente, pero las tasas de calificación todavía se solapan."
        : "Confianza alta: muestra suficiente y tasas de calificación claramente distintas.";
  return {
    kind: "winner",
    winner,
    confidence,
    text: `${GROUP_NAME[winner]} rinde mejor: cada lead calificado cuesta ${usd(w.cpql ?? 0)} frente a ${loser}. ${why}`,
  };
}

function kpi(key: Kpi["key"], value: number | null, prev: number | null, n: number, lowSample: boolean, series: (number | null)[], extra: Partial<Kpi> = {}): Kpi {
  return { key, value, prev, delta: relDelta(value, prev), n, lowSample, interval: null, series, ...extra };
}

export function buildKpis(cur: Totals, prev: Totals, weekly: Totals[]): Record<Kpi["key"], Kpi> {
  const rate = div(cur.qualified, cur.evaluated);
  const prevRate = div(prev.qualified, prev.evaluated);
  return {
    qualified: kpi("qualified", cur.qualified, prev.qualified, cur.evaluated, false, weekly.map((w) => w.qualified)),
    cpql: kpi("cpql", div(cur.spend, cur.qualified), div(prev.spend, prev.qualified), cur.qualified, cur.qualified < MIN_QUALIFIED, weekly.map((w) => div(w.spend, w.qualified))),
    cpl: kpi("cpl", div(cur.spend, cur.newLeads), div(prev.spend, prev.newLeads), cur.newLeads, cur.newLeads < MIN_LEADS, weekly.map((w) => div(w.spend, w.newLeads))),
    rate: kpi("rate", rate, prevRate, cur.evaluated, cur.evaluated < MIN_RATE_N, weekly.map((w) => div(w.qualified, w.evaluated)), {
      delta: rate === null || prevRate === null ? null : rate - prevRate,
      interval: toInterval(cur.qualified, cur.evaluated),
    }),
    spend: kpi("spend", cur.spend, prev.spend, 0, false, weekly.map((w) => w.spend)),
    newLeads: kpi("newLeads", cur.newLeads, prev.newLeads, cur.newLeads, false, weekly.map((w) => w.newLeads)),
  };
}

export function buildFunnel(raw: Record<string, unknown> | undefined): FunnelStep[] {
  const keys: FunnelStep["key"][] = ["found", "fit", "contacted", "responded", "qualified"];
  let prev: number | null = null;
  return keys.map((key) => {
    const value = num(raw?.[key]);
    const step: FunnelStep = { key, value, stepRate: prev === null ? null : div(value, prev) };
    prev = value;
    return step;
  });
}

/* ---------------- entry point ---------------- */

/** All business numbers for the period ending `now`. Sequential queries on purpose (see module doc). */
export async function computeBusinessMetrics(db: AppDb, opts: { rangeDays: number; now?: Date }): Promise<BusinessMetrics> {
  const now = opts.now ?? new Date();
  const R = opts.rangeDays;
  const start = new Date(now.getTime() - R * DAY);
  const prevStart = new Date(now.getTime() - 2 * R * DAY);
  const weeks = trendWeeks(now, R);
  const trendStart = weekStartUtc(weeks[0]);

  const cur = await periodTotals(db, start, now);
  const prev = await periodTotals(db, prevStart, start);
  const weekly = await weeklyTotals(db, trendStart, now);
  const cohort = await groupCohort(db, start, now);
  const spend = await groupSpend(db, start, now);
  const clicks = await metaClicks(db, start, now);
  const trendRaw = await groupTrend(db, trendStart, now);
  const funnelRaw = await groupFunnel(db, start, now);

  const zero: Totals = { newLeads: 0, spend: 0, evaluated: 0, qualified: 0 };
  const groups = {
    meta: buildGroup("meta", cohort.find((r) => r.grp === "meta"), spend.get("meta") ?? 0, clicks),
    faro: buildGroup("faro", cohort.find((r) => r.grp === "faro"), spend.get("faro") ?? 0, clicks),
  };
  const trend: TrendWeek[] = weeks.map((week) => {
    const at = (g: Group) => trendRaw.find((r) => r.wk === week && r.grp === g);
    return {
      week,
      meta: { leads: num(at("meta")?.n), qualified: num(at("meta")?.qualified) },
      faro: { leads: num(at("faro")?.n), qualified: num(at("faro")?.qualified) },
    };
  });
  return {
    rangeDays: R,
    periodStart: start.toISOString(),
    periodEnd: now.toISOString(),
    prevStart: prevStart.toISOString(),
    weeks,
    kpis: buildKpis(cur, prev, weeks.map((w) => weekly.get(w) ?? zero)),
    groups,
    verdict: buildVerdict(groups.meta, groups.faro),
    trend,
    funnel: {
      meta: buildFunnel(funnelRaw.find((r) => r.grp === "meta")),
      faro: buildFunnel(funnelRaw.find((r) => r.grp === "faro")),
    },
  };
}
