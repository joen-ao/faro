import type { MergedPair } from "@/features/dedupe/plan";
import { emptySourceCounters, type Counters, type StreamPoint } from "./types";

/** Aggregates counters from points (used by the client for filtered views and by tests). */
export function computeCounters(points: Iterable<StreamPoint>, pairs: readonly Pick<MergedPair, "mergedChannel">[] = []): Counters {
  const total = emptySourceCounters();
  const bySource: Record<string, ReturnType<typeof emptySourceCounters>> = {};
  const bump = (c: ReturnType<typeof emptySourceCounters>, status: StreamPoint["status"]) => {
    c.found++;
    if (status !== "found") c.fit++;
    if (status === "contacted" || status === "qualified") c.contacted++;
    if (status === "qualified") c.qualified++;
  };
  for (const p of points) {
    const src = (bySource[p.source] ??= emptySourceCounters());
    bump(src, p.status);
    bump(total, p.status);
  }
  for (const pair of pairs) {
    const src = (bySource[pair.mergedChannel] ??= emptySourceCounters());
    src.duplicates++;
    total.duplicates++;
  }
  return { total, bySource };
}

/** Maps the lead lifecycle status (SPEC §4) to what the map shows. */
export function toPointStatus(leadStatus: string): StreamPoint["status"] {
  switch (leadStatus) {
    case "fit":
      return "fit";
    case "contacted":
    case "responded":
      return "contacted";
    case "qualified":
      return "qualified";
    default:
      return "found";
  }
}
