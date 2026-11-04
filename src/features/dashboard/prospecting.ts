import { sql } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import { emailsToday, getDailyOutreach } from "@/features/outreach/daily";
import { whatsappSentToday } from "@/features/whatsapp/send";
import { getEnv } from "@/lib/env";
import { bogotaMidnight, bogotaYmd, type DashFilters, type DashWindow } from "./filters";

/**
 * F43 · Prospecting analytics under the global filters, computed live. It only reads leads that were contacted,
 * came from ads or produced a reply, meeting or qualification (hundreds to thousands, never the 60k imported
 * records). Queries run one after another (Supabase transaction pooler). Real data only (F13): no demo leads,
 * no mock messages, events, qualifications or costs.
 */

export type LeadChannel = "email" | "whatsapp" | "web_form" | "meta" | "inbound";
export const MIN_ROW_SAMPLE = 20;
const MIN_COST_SAMPLE = 3;

interface LeadRow {
  id: string;
  legal: boolean;
  city: string | null;
  src: string;
  huntId: string | null;
  createdAt: Date;
  contactedAt: Date | null;
  ch: LeadChannel;
  bounced: boolean;
}

export interface Metric {
  value: number | null;
  prev: number | null;
  /** Relative change (null when the previous value is 0 or missing). */
  delta: number | null;
  lowSample: boolean;
  /** One value per trend bucket. */
  series: (number | null)[];
}

export interface FunnelStep {
  key: "contacted" | "delivered" | "opened" | "replied" | "meeting" | "qualified";
  label: string;
  value: number;
  /** Conversion from the previous step (null for the first one). */
  rate: number | null;
}

export interface TrendBucket {
  /** yyyy-mm-dd (Bogotá day, or the Monday of the week). */
  key: string;
  sent: number;
  opened: number;
  replied: number;
  meetings: number;
}

export interface BreakdownRow {
  key: string;
  label: string;
  contacted: number;
  deliveryRate: number | null;
  openRate: number | null;
  replyRate: number | null;
  meetings: number;
  qualified: number;
  costUsd: number;
  lowSample: boolean;
}

export type BreakdownDim = "segment" | "source" | "hunt" | "city";

export interface ProspectingData {
  results: { meetings: Metric; qualified: Metric; costPerMeeting: Metric; cpql: Metric; spend: Metric };
  funnel: FunnelStep[];
  costPerContacted: number | null;
  costPerReply: number | null;
  /** Ad leads (Meta) that arrived in the period: they start at "replied". */
  meta: { arrived: number; meetings: number; qualified: number } | null;
  trend: TrendBucket[];
  breakdown: Record<BreakdownDim, BreakdownRow[]>;
  health: {
    contacted: number;
    deliveryRate: number | null;
    bounced: number;
    optOuts: number;
    complaints: number;
    unreported: number;
    spendByCategory: { category: string; usd: number }[];
    today: { emails: number; emailsPerDay: number; dailyEnabled: boolean; whatsapp: number; whatsappLimit: number };
  };
  hunts: { id: string; label: string }[];
}

async function rows<T>(db: AppDb, q: ReturnType<typeof sql>): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as T[] | { rows: T[] };
  return Array.isArray(r) ? r : r.rows;
}

const SENT_MSG = `not m.is_mock and (m.status in ('sent','delivered') or (m.status = 'failed' and m.sent_at is not null))`;

async function loadLeads(db: AppDb): Promise<LeadRow[]> {
  const r = await rows<Record<string, unknown>>(
    db,
    sql.raw(`
with m as (
  select m.lead_id, min(coalesce(m.sent_at, m.created_at)) as at,
    (array_agg(m.contact_channel::text order by coalesce(m.sent_at, m.created_at)))[1] as ch,
    bool_or(m.status = 'failed') as bounced
  from messages m where ${SENT_MSG} group by m.lead_id
), signal as (
  select distinct e.lead_id from events e where not (e.is_mock or e.is_demo) and e.type in ('reply','meeting_booked','purchase_intent')
  union select distinct q.lead_id from qualifications q where not (q.is_mock or q.is_demo)
)
select l.id, c.is_legal_entity as legal, c.city, l.primary_source::text as src, l.hunt_id as "huntId", l.created_at as "createdAt",
  m.at as "contactedAt", coalesce(m.ch, case when l.primary_source = 'meta_ads' then 'meta' else 'inbound' end) as ch, coalesce(m.bounced, false) as bounced
from leads l join companies c on c.id = l.company_id left join m on m.lead_id = l.id
where not l.is_demo and not c.is_demo and (m.lead_id is not null or l.primary_source = 'meta_ads' or l.id in (select lead_id from signal))`),
  );
  return r.map((x) => ({
    id: String(x.id),
    legal: Boolean(x.legal),
    city: (x.city as string | null) ?? null,
    src: String(x.src),
    huntId: (x.huntId as string | null) ?? null,
    createdAt: new Date(x.createdAt as string),
    contactedAt: x.contactedAt ? new Date(x.contactedAt as string) : null,
    ch: String(x.ch) as LeadChannel,
    bounced: Boolean(x.bounced),
  }));
}

export function matchesLead(l: Pick<LeadRow, "ch" | "legal" | "huntId">, f: DashFilters): boolean {
  if (f.channel === "email" && l.ch !== "email" && l.ch !== "web_form") return false;
  if (f.channel === "whatsapp" && l.ch !== "whatsapp") return false;
  if (f.channel === "meta" && l.ch !== "meta") return false;
  if (f.segment === "empresas" && !l.legal) return false;
  if (f.segment === "independientes" && l.legal) return false;
  if (f.huntId && l.huntId !== f.huntId) return false;
  return true;
}

const rate = (k: number, n: number) => (n > 0 ? k / n : null);
const delta = (v: number | null, p: number | null) => (v === null || p === null || p === 0 ? null : (v - p) / p);
const inW = (d: Date, a: Date, b: Date) => d >= a && d < b;
const DAY = 86_400_000;

/** Bucket keys covering the window (Bogotá days or weeks starting Monday). */
export function bucketKeys(w: Pick<DashWindow, "from" | "to" | "bucket">): string[] {
  const keys: string[] = [];
  const first = bucketOf(w.from, w.bucket);
  for (let t = new Date(`${first}T05:00:00Z`).getTime(); t < w.to.getTime(); t += w.bucket === "day" ? DAY : 7 * DAY) keys.push(bogotaYmd(new Date(t)));
  return keys;
}
export function bucketOf(d: Date, bucket: "day" | "week"): string {
  if (bucket === "day") return bogotaYmd(d);
  const mid = bogotaMidnight(d);
  const dow = (new Date(mid.getTime() - 5 * 3600_000).getUTCDay() + 6) % 7;
  return bogotaYmd(new Date(mid.getTime() - dow * DAY));
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export async function getProspecting(db: AppDb, f: DashFilters, w: DashWindow, opts: { now?: Date; sourceLabel?: (s: string) => string } = {}): Promise<ProspectingData> {
  const now = opts.now ?? new Date();
  const all = await loadLeads(db);
  const leads = all.filter((l) => matchesLead(l, f));
  const ids = new Set(leads.map((l) => l.id));

  const evRows = await rows<{ lead_id: string; type: string; at: string; payload: Record<string, unknown> }>(
    db,
    sql.raw(`select e.lead_id, e.type::text as type, e.at, e.payload from events e
where not (e.is_mock or e.is_demo) and e.type in ('delivered','click','widget_open','reply','opt_out','meeting_booked')`),
  );
  const qRows = await rows<{ lead_id: string; at: string }>(
    db,
    sql.raw(`select q.lead_id, min(q.created_at) as at from qualifications q where not (q.is_mock or q.is_demo) and q.qualified group by q.lead_id`),
  );
  const costRows = await rows<{ lead_id: string | null; at: string; category: string; usd: number; src: string | null }>(
    db,
    sql`select c.lead_id, c.at, c.category::text as category, c.usd::float8 as usd, c.source_channel::text as src
from cost_entries c left join leads l on l.id = c.lead_id
where not (c.is_mock or c.is_demo) and not coalesce(l.is_demo, false) and c.at >= ${w.prevFrom.toISOString()}::timestamptz and c.at < ${w.to.toISOString()}::timestamptz`,
  );
  // Costs of leads outside the loaded set (e.g. data/scraping of never-contacted records) only belong to the
  // unfiltered view; costs with no lead (ads, shared) too, except that ad spend also belongs to the Meta view.
  const unfiltered = f.channel === "all" && f.segment === "all" && !f.huntId;
  const loaded = new Set(all.map((l) => l.id));
  const costCounts = (c: { lead_id: string | null; src: string | null; category: string }) => {
    if (c.lead_id && loaded.has(c.lead_id)) return ids.has(c.lead_id);
    if (unfiltered) return true;
    return f.channel === "meta" && f.segment === "all" && !f.huntId && !c.lead_id && (c.src === "meta_ads" || c.category === "ads");
  };
  const costs = costRows.filter(costCounts).map((c) => ({ ...c, at: new Date(c.at), usd: Number(c.usd) }));

  const evs = evRows.filter((e) => ids.has(e.lead_id)).map((e) => ({ ...e, at: new Date(e.at) }));
  const qualifiedAt = new Map(qRows.filter((q) => ids.has(q.lead_id)).map((q) => [q.lead_id, new Date(q.at)]));
  const firstEvent = (type: string) => {
    const m = new Map<string, Date>();
    for (const e of evs) if (e.type === type && (!m.has(e.lead_id) || e.at < m.get(e.lead_id)!)) m.set(e.lead_id, e.at);
    return m;
  };
  const meetingAt = firstEvent("meeting_booked");
  const replyAt = firstEvent("reply");
  const deliveredAt = firstEvent("delivered");
  // Sends from before the Resend webhook reported deliveries never got the event: a non-bounced one counts as delivered.
  const reportingSince = deliveredAt.size ? Math.min(...[...deliveredAt.values()].map((d) => d.getTime())) - 3600_000 : null;
  for (const l of leads) {
    if (l.contactedAt && !l.bounced && !deliveredAt.has(l.id) && (l.ch === "email" || l.ch === "web_form") && (reportingSince === null || l.contactedAt.getTime() < reportingSince)) deliveredAt.set(l.id, l.contactedAt);
  }
  const openedAt = new Map<string, Date>();
  for (const e of evs) {
    const isOpen = e.type === "widget_open" || (e.type === "click" && e.payload?.kind === "page_view");
    if (isOpen && (!openedAt.has(e.lead_id) || e.at < openedAt.get(e.lead_id)!)) openedAt.set(e.lead_id, e.at);
  }

  const keys = bucketKeys(w);
  const countIn = (m: Map<string, Date>, a: Date, b: Date) => [...m.values()].filter((d) => inW(d, a, b)).length;
  const spendIn = (a: Date, b: Date) => costs.filter((c) => inW(c.at, a, b)).reduce((s, c) => s + c.usd, 0);
  const seriesOf = (m: Map<string, Date>) => {
    const s = new Map(keys.map((k) => [k, 0]));
    for (const d of m.values()) if (inW(d, w.from, w.to)) s.set(bucketOf(d, w.bucket), (s.get(bucketOf(d, w.bucket)) ?? 0) + 1);
    return keys.map((k) => s.get(k) ?? 0);
  };
  const spendSeries = () => {
    const s = new Map(keys.map((k) => [k, 0]));
    for (const c of costs) if (inW(c.at, w.from, w.to)) s.set(bucketOf(c.at, w.bucket), (s.get(bucketOf(c.at, w.bucket)) ?? 0) + c.usd);
    return keys.map((k) => s.get(k) ?? 0);
  };

  const meetings = countIn(meetingAt, w.from, w.to);
  const meetingsPrev = countIn(meetingAt, w.prevFrom, w.prevTo);
  const qualified = countIn(qualifiedAt, w.from, w.to);
  const qualifiedPrev = countIn(qualifiedAt, w.prevFrom, w.prevTo);
  const spend = spendIn(w.from, w.to);
  const spendPrev = spendIn(w.prevFrom, w.prevTo);
  const per = (s: number, n: number) => (n > 0 ? s / n : null);
  const mSeries = seriesOf(meetingAt);
  const qSeries = seriesOf(qualifiedAt);
  const sSeries = spendSeries();
  const metric = (value: number | null, prev: number | null, series: (number | null)[], lowSample = false): Metric => ({ value, prev, delta: delta(value, prev), lowSample, series });

  // Funnel: the cohort first contacted (email / WhatsApp) in the period, followed to today.
  const cohort = leads.filter((l) => l.contactedAt && inW(l.contactedAt, w.from, w.to) && l.ch !== "meta" && l.ch !== "inbound");
  const has = (m: Map<string, Date>, l: LeadRow) => m.has(l.id) && m.get(l.id)! >= new Date(l.contactedAt!.getTime() - 3600_000);
  const step = (list: LeadRow[], m: Map<string, Date>) => list.filter((l) => has(m, l)).length;
  const contacted = cohort.length;
  const delivered = step(cohort, deliveredAt);
  const opened = step(cohort, openedAt);
  const replied = step(cohort, replyAt);
  const met = step(cohort, meetingAt);
  const qual = cohort.filter((l) => qualifiedAt.has(l.id)).length;
  const steps: Omit<FunnelStep, "rate">[] = [
    { key: "contacted", label: "Contactados", value: contacted },
    { key: "delivered", label: "Entregados", value: delivered },
    { key: "opened", label: "Abrieron la propuesta", value: opened },
    { key: "replied", label: "Respondieron", value: replied },
    { key: "meeting", label: "Agendaron reunión", value: met },
    { key: "qualified", label: "Calificados", value: qual },
  ];
  const funnel = steps.map((s, i) => ({ ...s, rate: i === 0 ? null : rate(s.value, steps[i - 1]!.value) }));
  const cohortIds = new Set(cohort.map((l) => l.id));
  const cohortSpend = costs.filter((c) => c.lead_id && cohortIds.has(c.lead_id)).reduce((s, c) => s + c.usd, 0);

  const metaLeads = f.channel === "all" || f.channel === "meta" ? leads.filter((l) => l.ch === "meta" && inW(l.createdAt, w.from, w.to)) : [];
  const meta =
    f.channel === "all" || f.channel === "meta"
      ? { arrived: metaLeads.length, meetings: metaLeads.filter((l) => meetingAt.has(l.id)).length, qualified: metaLeads.filter((l) => qualifiedAt.has(l.id)).length }
      : null;

  // Trend: first contacts, proposal opens, replies and meetings per bucket.
  const firstContact = new Map(leads.filter((l) => l.contactedAt && l.ch !== "meta" && l.ch !== "inbound").map((l) => [l.id, l.contactedAt!]));
  const sentS = seriesOf(firstContact);
  const openS = seriesOf(openedAt);
  const replyS = seriesOf(replyAt);
  const trend = keys.map((key, i) => ({ key, sent: sentS[i]!, opened: openS[i]!, replied: replyS[i]!, meetings: mSeries[i]! }));

  // Breakdown of the same cohort.
  const huntRows = await rows<{ id: string; criteria: Record<string, unknown> | null }>(
    db,
    sql.raw(`select h.id, i.criteria from hunts h join icp_profiles i on i.id = h.icp_profile_id order by h.created_at desc limit 200`),
  );
  const huntLabel = new Map(
    huntRows.map((h) => {
      const c = h.criteria ?? {};
      return [h.id, [c.sector, c.city].filter((x) => typeof x === "string" && x).join(" · ") || "Búsqueda sin nombre"];
    }),
  );
  const costByLead = new Map<string, number>();
  for (const c of costs) if (c.lead_id && inW(c.at, w.from, w.to)) costByLead.set(c.lead_id, (costByLead.get(c.lead_id) ?? 0) + c.usd);
  const cityNames = new Map<string, Map<string, number>>();
  for (const l of cohort) {
    if (!l.city) continue;
    const k = fold(l.city);
    const m = cityNames.get(k) ?? new Map<string, number>();
    m.set(l.city, (m.get(l.city) ?? 0) + 1);
    cityNames.set(k, m);
  }
  const cityLabel = (k: string) => [...(cityNames.get(k)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? k;
  const srcLabel = opts.sourceLabel ?? ((s: string) => s);
  const dims: Record<BreakdownDim, (l: LeadRow) => [string, string]> = {
    segment: (l) => (l.legal ? ["empresas", "Empresas"] : ["independientes", "Independientes"]),
    source: (l) => [l.src, srcLabel(l.src)],
    hunt: (l) => (l.huntId ? [l.huntId, huntLabel.get(l.huntId) ?? "Búsqueda"] : ["none", "Sin búsqueda"]),
    city: (l) => (l.city ? [fold(l.city), ""] : ["none", "Sin ciudad"]),
  };
  const breakdown = Object.fromEntries(
    (Object.keys(dims) as BreakdownDim[]).map((dim) => {
      const groups = new Map<string, { label: string; list: LeadRow[] }>();
      for (const l of cohort) {
        const [k, label] = dims[dim](l);
        const g = groups.get(k) ?? { label: dim === "city" && k !== "none" ? cityLabel(k) : label, list: [] };
        g.list.push(l);
        groups.set(k, g);
      }
      const out: BreakdownRow[] = [...groups.entries()].map(([key, g]) => {
        const n = g.list.length;
        return {
          key,
          label: g.label,
          contacted: n,
          deliveryRate: rate(step(g.list, deliveredAt), n),
          openRate: rate(step(g.list, openedAt), n),
          replyRate: rate(step(g.list, replyAt), n),
          meetings: step(g.list, meetingAt),
          qualified: g.list.filter((l) => qualifiedAt.has(l.id)).length,
          costUsd: g.list.reduce((s, l) => s + (costByLead.get(l.id) ?? 0), 0),
          lowSample: n < MIN_ROW_SAMPLE,
        };
      });
      return [dim, out.sort((a, b) => b.contacted - a.contacted)];
    }),
  ) as Record<BreakdownDim, BreakdownRow[]>;

  // Health.
  const complaints = await rows<{ n: number }>(
    db,
    sql`select count(*)::int as n from suppression where reason = 'queja de spam' and at >= ${w.from.toISOString()}::timestamptz and at < ${w.to.toISOString()}::timestamptz`,
  );
  const deliveredMsgs = new Set(evs.filter((e) => e.type === "delivered").map((e) => e.lead_id));
  const deliveryBase = cohort.length;
  const unreported = leads.filter((l) => {
    const t = l.contactedAt?.getTime();
    return t !== undefined && (l.ch === "email" || l.ch === "web_form") && !l.bounced && !deliveredMsgs.has(l.id) && t < now.getTime() - 3600_000 && t > now.getTime() - 7 * DAY;
  }).length;
  const byCat = new Map<string, number>();
  for (const c of costs) if (inW(c.at, w.from, w.to)) byCat.set(c.category, (byCat.get(c.category) ?? 0) + c.usd);
  const env = getEnv();
  const daily = await getDailyOutreach(db);

  return {
    results: {
      meetings: metric(meetings, meetingsPrev, mSeries),
      qualified: metric(qualified, qualifiedPrev, qSeries),
      costPerMeeting: metric(per(spend, meetings), per(spendPrev, meetingsPrev), keys.map((_, i) => per(sSeries[i]!, mSeries[i]!)), meetings < MIN_COST_SAMPLE),
      cpql: metric(per(spend, qualified), per(spendPrev, qualifiedPrev), keys.map((_, i) => per(sSeries[i]!, qSeries[i]!)), qualified < MIN_COST_SAMPLE),
      spend: metric(spend, spendPrev, sSeries),
    },
    funnel,
    costPerContacted: per(cohortSpend, contacted),
    costPerReply: per(cohortSpend, replied),
    meta,
    trend,
    breakdown,
    health: {
      contacted,
      deliveryRate: rate(delivered, deliveryBase),
      bounced: cohort.filter((l) => l.bounced).length,
      optOuts: evs.filter((e) => e.type === "opt_out" && inW(e.at, w.from, w.to)).length,
      complaints: Number(complaints[0]?.n ?? 0),
      unreported,
      spendByCategory: [...byCat.entries()].map(([category, usd]) => ({ category, usd })).sort((a, b) => b.usd - a.usd),
      today: {
        emails: await emailsToday(db, now),
        emailsPerDay: daily.setting.emailsPerDay,
        dailyEnabled: daily.setting.enabled,
        whatsapp: await whatsappSentToday(db, now),
        whatsappLimit: env.WHATSAPP_DAILY_LIMIT,
      },
    },
    hunts: huntRows
      .filter((h) => all.some((l) => l.huntId === h.id && l.contactedAt))
      .map((h) => ({ id: h.id, label: huntLabel.get(h.id) ?? "Búsqueda" })),
  };
}
