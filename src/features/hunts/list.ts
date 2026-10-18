import { desc, eq, sql } from "drizzle-orm";
import { hunts, icpProfiles, leads, messages } from "@/db/schema";
import type { AppDb } from "@/db/types";

export interface HuntSummary {
  id: string;
  status: string;
  createdAt: Date;
  prompt: string;
  sector: string | null;
  city: string | null;
  isDemo: boolean;
  leads: number;
  fit: number;
  queued: number;
  sent: number;
  responded: number;
  qualified: number;
}

/** Every hunt, newest first, with real-only lead and outreach counts (demo leads never mix in). */
export async function listHunts(db: AppDb, limit = 50): Promise<HuntSummary[]> {
  const rows = await db
    .select({
      id: hunts.id,
      status: hunts.status,
      createdAt: hunts.createdAt,
      prompt: icpProfiles.prompt,
      criteria: icpProfiles.criteria,
      total: sql<number>`count(${leads.id}) filter (where ${leads.isDemo} = false)`.mapWith(Number),
      demo: sql<number>`count(${leads.id}) filter (where ${leads.isDemo} = true)`.mapWith(Number),
      fit: sql<number>`count(${leads.id}) filter (where ${leads.isDemo} = false and ${leads.status} <> 'found' and ${leads.status} <> 'disqualified')`.mapWith(Number),
      responded: sql<number>`count(${leads.id}) filter (where ${leads.isDemo} = false and ${leads.status} in ('responded', 'qualified'))`.mapWith(Number),
      qualified: sql<number>`count(${leads.id}) filter (where ${leads.isDemo} = false and ${leads.status} = 'qualified')`.mapWith(Number),
    })
    .from(hunts)
    .innerJoin(icpProfiles, eq(icpProfiles.id, hunts.icpProfileId))
    .leftJoin(leads, eq(leads.huntId, hunts.id))
    .groupBy(hunts.id, icpProfiles.id)
    .orderBy(desc(hunts.createdAt))
    .limit(limit);

  const msgs = await db
    .select({
      huntId: leads.huntId,
      queued: sql<number>`count(*) filter (where ${messages.status} = 'queued')`.mapWith(Number),
      sent: sql<number>`count(*) filter (where ${messages.status} in ('sent', 'delivered'))`.mapWith(Number),
    })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .where(eq(leads.isDemo, false))
    .groupBy(leads.huntId);
  const byHunt = new Map(msgs.map((m) => [m.huntId, m]));

  return rows.map((r) => {
    const c = (r.criteria ?? {}) as { sector?: unknown; city?: unknown };
    const m = byHunt.get(r.id);
    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      prompt: r.prompt,
      sector: typeof c.sector === "string" ? c.sector : null,
      city: typeof c.city === "string" ? c.city : null,
      isDemo: r.total === 0 && r.demo > 0,
      leads: r.total || r.demo,
      fit: r.fit,
      queued: m?.queued ?? 0,
      sent: m?.sent ?? 0,
      responded: r.responded,
      qualified: r.qualified,
    };
  });
}
