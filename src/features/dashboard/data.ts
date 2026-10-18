import { sql } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import { LEAD_FACTS, getChannelMetrics, type MetricsBucket } from "@/features/metrics/channels";
import { getLeadReceipts, type LeadReceipt } from "@/features/metrics/receipt";
import { queryComplianceMetrics, type ComplianceMetrics } from "@/features/compliance/metrics";
import { buildChallenge, queryChallengeFacts, type ChallengeItem } from "./challenge";
import { getDemoDb } from "./demo-db";

export interface DashboardData {
  /** Real data only. */
  real: MetricsBucket;
  /** Separate DEMO bucket, present only when the toggle is on. Never summed into `real`. */
  demo: MetricsBucket | null;
  compliance: ComplianceMetrics;
  /** "Reto Dapta" requirements with live real-only numbers. */
  challenge: ChallengeItem[];
}

/**
 * The DEMO bucket always comes from the built-in in-memory dataset (nothing is written, and rows seeded
 * in the persistent DB never change what the demo section shows). `real` only reads the persistent DB.
 */
export async function getDashboardData(db: AppDb, opts: { includeDemo?: boolean } = {}): Promise<DashboardData> {
  const real = (await getChannelMetrics(db)).real;
  const demo = opts.includeDemo ? (await getChannelMetrics(await getDemoDb(), { includeDemo: true })).demo : null;
  const compliance = await queryComplianceMetrics(db);
  const challenge = buildChallenge(await queryChallengeFacts(db), real, compliance);
  return { real, demo, compliance, challenge };
}

export interface CellLead {
  leadId: string;
  name: string;
  slug: string;
  fit: boolean;
  contacted: boolean;
  responded: boolean;
  qualified: boolean;
  /** Real world: only non-mock, non-demo entries (matches the cell number). */
  costUsd: number;
  /** Mock/demo cost on this lead, excluded from `costUsd` and shown apart with a stamp. */
  excludedUsd: number;
  receipt: LeadReceipt | null;
}

export const CELL_LIMIT = 25;

/** Leads (with their receipts) behind one matrix cell. `contact` null = every channel of that source. */
export async function getCellLeads(db: AppDb, p: { source: string; contact: string | null; demo: boolean }): Promise<{ total: number; leads: CellLead[] }> {
  const res = (await db.execute(
    sql`${sql.raw(LEAD_FACTS)}
select lf.id as "leadId", c.name, l.slug, lf.fit, lf.contacted, lf.responded, lf.qualified,
  (select coalesce(sum(e.usd) filter (where ${p.demo}::boolean or not (e.is_mock or e.is_demo)), 0) from cost_entries e where e.lead_id = lf.id)::float8 as "costUsd",
  (select coalesce(sum(e.usd) filter (where not ${p.demo}::boolean and (e.is_mock or e.is_demo)), 0) from cost_entries e where e.lead_id = lf.id)::float8 as "excludedUsd"
from lf join leads l on l.id = lf.id join companies c on c.id = l.company_id
where lf.src = ${p.source} and lf.demo = ${p.demo} and (${p.contact}::text is null or lf.ch = ${p.contact})
order by lf.qualified desc, lf.fit desc, c.name`,
  )) as unknown as Omit<CellLead, "receipt">[] | { rows: Omit<CellLead, "receipt">[] };
  const all = Array.isArray(res) ? res : res.rows;
  const shown = all.slice(0, CELL_LIMIT);
  const receipts = await getLeadReceipts(db, shown.map((r) => r.leadId));
  const leads = shown.map((r) => ({ ...r, receipt: receipts.get(r.leadId) ?? null }));
  return { total: all.length, leads };
}
