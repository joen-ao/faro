import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { hunts, icpProfiles, leads, messages } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { areaLabel } from "@/features/icp/presets";

export interface HuntSourceCount {
  source: string;
  leads: number;
}

export interface HuntSummary {
  id: string;
  status: string;
  createdAt: Date;
  prompt: string;
  sector: string | null;
  city: string | null;
  /** "Bogotá", "Bogotá +2" or "Colombia (5 ciudades)". */
  area: string | null;
  isDemo: boolean;
  leads: number;
  fit: number;
  queued: number;
  sent: number;
  responded: number;
  qualified: number;
  /** Leads per primary source, biggest first. Real leads only; on a DEMO hunt, its own demo leads (never mixed). */
  bySource: HuntSourceCount[];
  /** Merged duplicate pairs stored by dedupe (mock pairs excluded); 0 on DEMO hunts. */
  mergedDuplicates: number;
}

/** Every hunt, newest first, with real-only lead and outreach counts (demo leads never mix in). */
export async function listHunts(db: AppDb, limit = 50): Promise<HuntSummary[]> {
  const rows = await db
    .select({
      id: hunts.id,
      status: hunts.status,
      createdAt: hunts.createdAt,
      progress: hunts.progress,
      prompt: icpProfiles.prompt,
      criteria: icpProfiles.criteria,
      total: sql<number>`count(${leads.id}) filter (where ${leads.isDemo} = false)`.mapWith(Number),
      demo: sql<number>`count(${leads.id}) filter (where ${leads.isDemo} = true)`.mapWith(Number),
      fit: sql<number>`count(${leads.id}) filter (where ${leads.isDemo} = false and ${leads.status} <> 'found' and ${leads.status} <> 'disqualified')`.mapWith(Number),
      demoFit: sql<number>`count(${leads.id}) filter (where ${leads.isDemo} = true and ${leads.status} <> 'found' and ${leads.status} <> 'disqualified')`.mapWith(Number),
      responded: sql<number>`count(${leads.id}) filter (where ${leads.isDemo} = false and ${leads.status} in ('responded', 'qualified'))`.mapWith(Number),
      qualified: sql<number>`count(${leads.id}) filter (where ${leads.isDemo} = false and ${leads.status} = 'qualified')`.mapWith(Number),
    })
    .from(hunts)
    .innerJoin(icpProfiles, eq(icpProfiles.id, hunts.icpProfileId))
    .leftJoin(leads, eq(leads.huntId, hunts.id))
    .groupBy(hunts.id, icpProfiles.id)
    .orderBy(desc(hunts.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const msgs = await db
    .select({
      huntId: leads.huntId,
      queued: sql<number>`count(*) filter (where ${messages.status} = 'queued')`.mapWith(Number),
      sent: sql<number>`count(*) filter (where ${messages.status} in ('sent', 'delivered'))`.mapWith(Number),
    })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .where(and(eq(leads.isDemo, false), inArray(leads.huntId, ids)))
    .groupBy(leads.huntId);
  const byHunt = new Map(msgs.map((m) => [m.huntId, m]));

  const src = await db
    .select({ huntId: leads.huntId, source: sql<string>`${leads.primarySource}::text`, isDemo: leads.isDemo, n: sql<number>`count(*)`.mapWith(Number) })
    .from(leads)
    .where(inArray(leads.huntId, ids))
    .groupBy(leads.huntId, leads.primarySource, leads.isDemo);

  return rows.map((r) => {
    const c = (r.criteria ?? {}) as { sector?: unknown; city?: unknown; cities?: unknown; scope?: unknown; country?: unknown };
    const m = byHunt.get(r.id);
    const isDemo = r.total === 0 && r.demo > 0;
    const bySource = src
      .filter((x) => x.huntId === r.id && x.isDemo === isDemo)
      .map((x) => ({ source: x.source, leads: x.n }))
      .sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source));
    const pairs = ((r.progress ?? {}) as { dedupe?: { pairs?: { isMock?: boolean }[] } }).dedupe?.pairs ?? [];
    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      prompt: r.prompt,
      sector: typeof c.sector === "string" ? c.sector : null,
      city: typeof c.city === "string" ? c.city : null,
      area: areaLabel(c),
      isDemo,
      leads: isDemo ? r.demo : r.total,
      fit: isDemo ? r.demoFit : r.fit,
      queued: m?.queued ?? 0,
      sent: m?.sent ?? 0,
      responded: r.responded,
      qualified: r.qualified,
      bySource,
      mergedDuplicates: isDemo ? 0 : pairs.filter((p) => p.isMock !== true).length,
    };
  });
}
