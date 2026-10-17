import { sql } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import { LEAD_FACTS, getChannelMetrics, type MetricsBucket } from "@/features/metrics/channels";
import { getLeadReceipt, type LeadReceipt } from "@/features/metrics/receipt";
import { queryComplianceMetrics, type ComplianceMetrics } from "@/features/compliance/metrics";
import { getDemoDb } from "./demo-db";

export interface DashboardData {
  /** Real data only. */
  real: MetricsBucket;
  /** Separate DEMO bucket, present only when the toggle is on. Never summed into `real`. */
  demo: MetricsBucket | null;
  compliance: ComplianceMetrics;
}

const hasData = (b: MetricsBucket | null) => !!b && (b.totals.found > 0 || b.totals.costUsd > 0);

/**
 * The persistent DB may hold seeded demo rows; if it has none, the demo bucket comes from an
 * ephemeral in-memory dataset so the dashboard can be shown full without writing anything.
 */
export async function resolveDemoDb(db: AppDb, persistentDemo: MetricsBucket | null): Promise<AppDb> {
  return hasData(persistentDemo) ? db : getDemoDb();
}

export async function getDashboardData(db: AppDb, opts: { includeDemo?: boolean } = {}): Promise<DashboardData> {
  const m = await getChannelMetrics(db, { includeDemo: !!opts.includeDemo });
  let demo = m.demo;
  if (opts.includeDemo && !hasData(demo)) demo = (await getChannelMetrics(await getDemoDb(), { includeDemo: true })).demo;
  return { real: m.real, demo: opts.includeDemo ? demo : null, compliance: await queryComplianceMetrics(db) };
}

export interface CellLead {
  leadId: string;
  name: string;
  slug: string;
  fit: boolean;
  contacted: boolean;
  responded: boolean;
  qualified: boolean;
  costUsd: number;
  receipt: LeadReceipt | null;
}

export const CELL_LIMIT = 25;

/** Leads (with their receipts) behind one matrix cell. `contact` null = every channel of that source. */
export async function getCellLeads(db: AppDb, p: { source: string; contact: string | null; demo: boolean }): Promise<{ total: number; leads: CellLead[] }> {
  const res = (await db.execute(
    sql`${sql.raw(LEAD_FACTS)}
select lf.id as "leadId", c.name, l.slug, lf.fit, lf.contacted, lf.responded, lf.qualified,
  (select coalesce(sum(e.usd), 0) from cost_entries e where e.lead_id = lf.id)::float8 as "costUsd"
from lf join leads l on l.id = lf.id join companies c on c.id = l.company_id
where lf.src = ${p.source} and lf.demo = ${p.demo} and (${p.contact}::text is null or lf.ch = ${p.contact})
order by lf.qualified desc, lf.fit desc, c.name`,
  )) as unknown as Omit<CellLead, "receipt">[] | { rows: Omit<CellLead, "receipt">[] };
  const all = Array.isArray(res) ? res : res.rows;
  const leads = await Promise.all(all.slice(0, CELL_LIMIT).map(async (r) => ({ ...r, receipt: await getLeadReceipt(db, r.leadId) })));
  return { total: all.length, leads };
}
