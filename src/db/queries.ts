import { and, eq, sql } from "drizzle-orm";
import { costEntries } from "./schema";
import type { AppDb, CostCategory } from "./types";

export interface CostTotals {
  totalUsd: number;
  byCategory: Partial<Record<CostCategory, number>>;
}

/**
 * Cost totals. By default only real data: rows flagged `is_demo` or `is_mock` are excluded
 * (SPEC §7). Pass `includeDemo: true` for the "Incluir datos de prueba" toggle.
 */
export async function getCostTotals(db: AppDb, opts: { includeDemo?: boolean } = {}): Promise<CostTotals> {
  const where = opts.includeDemo ? undefined : and(eq(costEntries.isDemo, false), eq(costEntries.isMock, false));
  const rows = await db
    .select({ category: costEntries.category, total: sql<number>`coalesce(sum(${costEntries.usd}), 0)::float8` })
    .from(costEntries)
    .where(where)
    .groupBy(costEntries.category);
  const byCategory: CostTotals["byCategory"] = {};
  let totalUsd = 0;
  for (const r of rows) {
    byCategory[r.category] = r.total;
    totalUsd += r.total;
  }
  return { totalUsd, byCategory };
}
