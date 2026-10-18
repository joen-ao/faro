import { sql } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import { betaCredibleInterval, type CredibleInterval } from "./beta";
import { round6 } from "./costs";

export interface MetricsRow {
  /** source_channel (null on contact-only rows) */
  source: string | null;
  /** contact_channel (null on source-only rows) */
  contact: string | null;
  found: number;
  /** leads of the profile: fit_score >= ICP threshold */
  fit: number;
  contacted: number;
  /** Opened the diagnostic page (widget_open, or click with payload.kind = page_view). */
  opened: number;
  responded: number;
  /** Talked to the Dapta agent (widget_chat event or a Dapta-origin qualification). */
  chatted: number;
  qualified: number;
  costUsd: number;
  /** costUsd / fit, null when fit = 0 */
  cpl: number | null;
  /** costUsd / qualified, null when qualified = 0 ("datos insuficientes") */
  cplc: number | null;
  insufficientData: boolean;
  /** qualified / fit with a 90 % credible interval, Beta(1+k, 1+n-k) */
  qualifiedRate: CredibleInterval;
}

export interface MetricsBucket {
  /** Mock cost that hit leads of this bucket's world but is excluded from `real` (so CPL is not silently understated). Only set on `real`. */
  excludedMockUsd: number;
  /** is_demo cost on real leads / leadless demo entries, excluded from `real`. Only set on `real`. */
  excludedDemoUsd: number;
  bySource: MetricsRow[];
  byContact: MetricsRow[];
  /** source x contact cells (matrix) */
  cells: MetricsRow[];
  totals: MetricsRow;
  /** cost with neither a lead nor a source channel */
  unattributedUsd: number;
}

export interface ChannelMetrics {
  /** Real data only (is_demo / is_mock excluded). */
  real: MetricsBucket;
  /** Present only with includeDemo; NEVER summed into `real`. */
  demo: MetricsBucket | null;
}

type Dim = "source" | "contact" | "cell";
interface Raw {
  src: string | null;
  ch: string | null;
  demo: boolean;
  found?: number;
  fit?: number;
  contacted?: number;
  opened?: number;
  responded?: number;
  chatted?: number;
  qualified?: number;
  qfit?: number;
  usd?: number;
  excl?: string | null;
}

/**
 * One row per lead with its funnel flags. Mock messages/events/qualifications only count for demo leads
 * (SPEC §7: mock never mixes with real; neither do demo-flagged events/qualifications on a real lead). The contact channel is that of the first sent message,
 * or `dapta_widget` for inbound widget activity.
 */
export const LEAD_FACTS = `
with lf as (
  select l.id, l.primary_source::text as src, l.is_demo as demo,
    coalesce(l.fit_score >= coalesce(i.threshold, 60), false) as fit,
    coalesce(
      (select m.contact_channel::text from messages m
        where m.lead_id = l.id and m.status in ('sent','delivered') and (l.is_demo or not m.is_mock)
        order by m.sent_at asc nulls last, m.created_at asc limit 1),
      (select 'dapta_widget' from events e
        where e.lead_id = l.id and e.type in ('widget_open','widget_chat','form_submit') and (l.is_demo or not (e.is_mock or e.is_demo)) limit 1)
    ) as ch,
    exists (select 1 from events e where e.lead_id = l.id and e.type in ('reply','widget_chat','form_submit') and (l.is_demo or not (e.is_mock or e.is_demo))) as responded,
    exists (select 1 from messages m where m.lead_id = l.id and m.status in ('sent','delivered') and (l.is_demo or not m.is_mock)) as contacted,
    exists (select 1 from events e where e.lead_id = l.id and (e.type = 'widget_open' or (e.type = 'click' and e.payload->>'kind' = 'page_view')) and (l.is_demo or not (e.is_mock or e.is_demo))) as opened,
    (exists (select 1 from events e where e.lead_id = l.id and e.type = 'widget_chat' and (l.is_demo or not (e.is_mock or e.is_demo)))
      or exists (select 1 from qualifications q where q.lead_id = l.id and q.origin = 'dapta' and (l.is_demo or not (q.is_mock or q.is_demo)))) as chatted,
    exists (select 1 from qualifications q where q.lead_id = l.id and q.qualified and (l.is_demo or not (q.is_mock or q.is_demo))) as qualified
  from leads l
  left join hunts h on h.id = l.hunt_id
  left join icp_profiles i on i.id = h.icp_profile_id
)`;

const GROUP: Record<Dim, { sel: string; grp: string }> = {
  source: { sel: "src, null::text as ch", grp: "src, demo" },
  contact: { sel: "null::text as src, ch", grp: "ch, demo" },
  cell: { sel: "src, ch", grp: "src, ch, demo" },
};
const COST_GROUP: Record<Dim, { sel: string; grp: string }> = {
  source: { sel: "coalesce(e.source_channel::text, f.src) as src, null::text as ch", grp: "1, 3, 4" },
  contact: { sel: "null::text as src, f.ch as ch", grp: "2, 3, 4" },
  cell: { sel: "coalesce(e.source_channel::text, f.src) as src, f.ch as ch", grp: "1, 2, 3, 4" },
};

async function rows<T>(db: AppDb, q: ReturnType<typeof sql>): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as T[] | { rows: T[] };
  return Array.isArray(r) ? r : r.rows;
}

/** Two fixed SQL aggregations per dimension (funnel and cost); no per-lead queries. */
async function aggregate(db: AppDb, dim: Dim): Promise<Raw[]> {
  const g = GROUP[dim];
  const filter = dim === "source" ? "" : "where ch is not null";
  const funnel = await rows<Raw>(
    db,
    sql.raw(`${LEAD_FACTS}
select ${g.sel}, demo,
  count(*)::int as found,
  (count(*) filter (where fit))::int as fit,
  (count(*) filter (where contacted))::int as contacted,
  (count(*) filter (where opened))::int as opened,
  (count(*) filter (where responded))::int as responded,
  (count(*) filter (where chatted))::int as chatted,
  (count(*) filter (where qualified))::int as qualified,
  (count(*) filter (where qualified and fit))::int as qfit
from lf ${filter} group by ${g.grp}`),
  );
  const c = COST_GROUP[dim];
  const cost = await rows<Raw>(
    db,
    sql.raw(`${LEAD_FACTS}
select ${c.sel}, (e.is_demo or e.is_mock or coalesce(f.demo, false)) as demo,
  (case when not coalesce(f.demo, false) and e.is_mock then 'mock' when not coalesce(f.demo, false) and e.is_demo then 'demo' end) as excl,
  coalesce(sum(e.usd), 0)::float8 as usd
from cost_entries e left join lf f on f.id = e.lead_id
group by ${c.grp}`),
  );
  return [...funnel, ...cost];
}

function buildRow(source: string | null, contact: string | null, a: Counts): MetricsRow {
  const costUsd = round6(a.usd);
  return {
    source,
    contact,
    found: a.found,
    fit: a.fit,
    contacted: a.contacted,
    opened: a.opened,
    responded: a.responded,
    chatted: a.chatted,
    qualified: a.qualified,
    costUsd,
    cpl: a.fit > 0 ? costUsd / a.fit : null,
    cplc: a.qualified > 0 ? costUsd / a.qualified : null,
    insufficientData: a.qualified === 0,
    qualifiedRate: betaCredibleInterval(a.qfit, a.fit),
  };
}

type Counts = { found: number; fit: number; contacted: number; opened: number; responded: number; chatted: number; qualified: number; qfit: number; usd: number };
const zero = (): Counts => ({ found: 0, fit: 0, contacted: 0, opened: 0, responded: 0, chatted: 0, qualified: 0, qfit: 0, usd: 0 });

function fold(raw: Raw[], demo: boolean, dim: Dim): { rows: MetricsRow[]; unattributed: number; nullKeyUsd: number } {
  const acc = new Map<string, { src: string | null; ch: string | null; v: ReturnType<typeof zero> }>();
  let unattributed = 0;
  let nullKeyUsd = 0;
  for (const r of raw) {
    if (!!r.demo !== demo) continue;
    const missing = dim === "source" ? r.src === null : dim === "contact" ? r.ch === null : r.src === null || r.ch === null;
    if (missing) {
      if (r.usd !== undefined) {
        nullKeyUsd += r.usd;
        if (dim === "source") unattributed += r.usd;
      }
      continue;
    }
    const key = `${r.src}|${r.ch}`;
    const cur = acc.get(key) ?? { src: r.src, ch: r.ch, v: zero() };
    for (const k of ["found", "fit", "contacted", "opened", "responded", "chatted", "qualified", "qfit", "usd"] as const) cur.v[k] += r[k] ?? 0;
    acc.set(key, cur);
  }
  const out = [...acc.values()].map((x) => buildRow(x.src, x.ch, x.v));
  out.sort((a, b) => b.fit - a.fit || (a.source ?? a.contact ?? "").localeCompare(b.source ?? b.contact ?? ""));
  return { rows: out, unattributed, nullKeyUsd };
}

/**
 * Funnel, cost, CPL, CPLC and qualified-rate interval per source, per contact channel and per
 * source x contact cell. Default is real data only; with `includeDemo` demo/mock data comes back
 * in a separate `demo` bucket (never summed into `real`).
 */
export async function getChannelMetrics(db: AppDb, opts: { includeDemo?: boolean } = {}): Promise<ChannelMetrics> {
  const [bySource, byContact, cells] = [await aggregate(db, "source"), await aggregate(db, "contact"), await aggregate(db, "cell")];
  const bucket = (demo: boolean): MetricsBucket => {
    const src = fold(bySource, demo, "source");
    const total = zero();
    for (const r of src.rows) {
      total.found += r.found;
      total.fit += r.fit;
      total.contacted += r.contacted;
      total.opened += r.opened;
      total.responded += r.responded;
      total.chatted += r.chatted;
      total.qualified += r.qualified;
      total.qfit += r.qualifiedRate.k;
    }
    total.usd = src.rows.reduce((a, r) => a + r.costUsd, 0) + src.unattributed;
    const excluded = (kind: string) => round6(bySource.filter((r) => r.demo && r.excl === kind).reduce((a, r) => a + (r.usd ?? 0), 0));
    return {
      excludedMockUsd: demo ? 0 : excluded("mock"),
      excludedDemoUsd: demo ? 0 : excluded("demo"),
      bySource: src.rows,
      byContact: fold(byContact, demo, "contact").rows,
      cells: fold(cells, demo, "cell").rows,
      totals: buildRow(null, null, total),
      unattributedUsd: round6(src.unattributed),
    };
  };
  return { real: bucket(false), demo: opts.includeDemo ? bucket(true) : null };
}
