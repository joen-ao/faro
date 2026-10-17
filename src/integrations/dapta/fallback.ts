import { eq } from "drizzle-orm";
import { events, leads, qualifications } from "@/db/schema";
import type { AppDb } from "@/db/types";

export interface FallbackSignals {
  fitScore: number | null;
  hasGenericContact: boolean;
  hasWebsite: boolean;
}

/**
 * Optional heuristic used only when Dapta is unavailable. It is NOT a Dapta result:
 * origin is always `fallback` and the row is always `is_mock` (excluded from real totals).
 */
export function fallbackQualify(s: FallbackSignals, threshold = 60): { qualified: boolean; score: number } {
  const score = Math.min(100, Math.round((s.fitScore ?? 0) * 0.8 + (s.hasGenericContact ? 12 : 0) + (s.hasWebsite ? 8 : 0)));
  return { qualified: score >= threshold, score };
}

/** Stores a fallback qualification (origin `fallback`, `is_mock=true`). Does not change the lead status. */
export async function recordFallbackQualification(db: AppDb, leadId: string, signals: FallbackSignals, threshold = 60) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return undefined;
  const r = fallbackQualify(signals, threshold);
  await db.insert(qualifications).values({
    leadId,
    origin: "fallback",
    qualified: r.qualified,
    score: r.score,
    bant: {},
    summary: "Calificación de respaldo (heurística de Faro, no es Dapta).",
    isDemo: lead.isDemo,
    isMock: true,
  });
  await db.insert(events).values({
    leadId,
    type: r.qualified ? "qualified" : "disqualified",
    payload: { origin: "fallback", score: r.score },
    isDemo: lead.isDemo,
    isMock: true,
  });
  return r;
}
