import { sql } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import { LEAD_FACTS, getChannelMetrics, type MetricsBucket } from "@/features/metrics/channels";
import { queryComplianceMetrics, type ComplianceMetrics } from "@/features/compliance/metrics";
import { getOutreachMetrics, type OutreachMetrics } from "@/features/metrics/outreach";
import { computeBusinessMetrics, type BusinessMetrics } from "./business";
import { DEFAULT_MAX_AGE_MIN, getSnapshot, readSnapshot, refreshSnapshot, type Snapshot } from "./snapshot";
import { getLeadReceipts, type LeadReceipt } from "@/features/metrics/receipt";
/** Snapshot keys (F31; bump the version when the JSON shape changes). The business view depends on the range; the detail (all-time F13/F14) does not. */
export const BUSINESS_KEY = "dashboard:v1";
export const DETAIL_KEY = "dashboard-detail:v1";
/** `range_days` used for the range-independent detail snapshot. */
export const ALL_TIME = 0;

/** All-time source x channel matrix (F14), compliance panel and outreach metrics (F26). Real data only. */
export interface DashboardDetail {
  matrix: MetricsBucket;
  compliance: ComplianceMetrics;
  outreach: OutreachMetrics;
}

/** Sequential on purpose: these heavy queries hung Supabase's transaction pooler when run in parallel. */
export async function computeDashboardDetail(db: AppDb): Promise<DashboardDetail> {
  const matrix = (await getChannelMetrics(db)).real;
  const compliance = await queryComplianceMetrics(db);
  const outreach = await getOutreachMetrics(db);
  return { matrix, compliance, outreach };
}

export const computeBusiness = (rangeDays: number) => (db: AppDb) => computeBusinessMetrics(db, { rangeDays });

/** What the dashboard page reads: stored copies (computed inline only the first time). */
export async function getDashboardSnapshots(db: AppDb, rangeDays: number): Promise<{ business: Snapshot<BusinessMetrics>; detail: Snapshot<DashboardDetail> }> {
  const business = await getSnapshot(db, BUSINESS_KEY, rangeDays, DEFAULT_MAX_AGE_MIN, computeBusiness(rangeDays));
  const detail = await getSnapshot(db, DETAIL_KEY, ALL_TIME, DEFAULT_MAX_AGE_MIN, computeDashboardDetail);
  return { business, detail };
}

/** "Actualizar ahora": recomputes both snapshots (skips one another request is already computing). */
export async function refreshDashboard(db: AppDb, rangeDays: number): Promise<{ business: boolean; detail: boolean }> {
  const business = await refreshSnapshot(db, BUSINESS_KEY, rangeDays, computeBusiness(rangeDays));
  const detail = await refreshSnapshot(db, DETAIL_KEY, ALL_TIME, computeDashboardDetail);
  return { business: business !== null, detail: detail !== null };
}

/** Stored detail copy only (Pauta, copilot): never recomputes on page load. */
export const readDashboardDetail = (db: AppDb) => readSnapshot<DashboardDetail>(db, DETAIL_KEY, ALL_TIME);

export interface CellLead {
  leadId: string;
  name: string;
  slug: string;
  fit: boolean;
  contacted: boolean;
  responded: boolean;
  qualified: boolean;
  /** Only non-mock, non-demo entries (matches the cell number). */
  costUsd: number;
  /** Mock/demo cost on this lead, excluded from `costUsd` and shown apart with a stamp. */
  excludedUsd: number;
  receipt: LeadReceipt | null;
}

export const CELL_LIMIT = 25;

/** Leads (with their receipts) behind one matrix cell. `contact` null = every channel of that source. */
export async function getCellLeads(db: AppDb, p: { source: string; contact: string | null }): Promise<{ total: number; leads: CellLead[] }> {
  const res = (await db.execute(
    sql`${sql.raw(LEAD_FACTS)}
select lf.id as "leadId", c.name, l.slug, lf.fit, lf.contacted, lf.responded, lf.qualified,
  (select coalesce(sum(e.usd) filter (where not (e.is_mock or e.is_demo)), 0) from cost_entries e where e.lead_id = lf.id)::float8 as "costUsd",
  (select coalesce(sum(e.usd) filter (where e.is_mock or e.is_demo), 0) from cost_entries e where e.lead_id = lf.id)::float8 as "excludedUsd"
from lf join leads l on l.id = lf.id join companies c on c.id = l.company_id
where lf.src = ${p.source} and not lf.demo and (${p.contact}::text is null or lf.ch = ${p.contact})
order by lf.qualified desc, lf.fit desc, c.name`,
  )) as unknown as Omit<CellLead, "receipt">[] | { rows: Omit<CellLead, "receipt">[] };
  const all = Array.isArray(res) ? res : res.rows;
  const shown = all.slice(0, CELL_LIMIT);
  const receipts = await getLeadReceipts(db, shown.map((r) => r.leadId));
  const leads = shown.map((r) => ({ ...r, receipt: receipts.get(r.leadId) ?? null }));
  return { total: all.length, leads };
}
