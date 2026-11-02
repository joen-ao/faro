import type { AppDb } from "@/db/types";
import { dbCallRecorder, loadAiRates, recordAiCost } from "@/features/scoring/cost";
import type { AnthropicAdapter } from "@/integrations/anthropic";
import { generateLearnings, type LearningsResult } from "./learnings";

/** Runs the weekly learnings and records the AI cost (mock usage is flagged and stays out of real totals). */
export async function runLearnings(db: AppDb, ai: AnthropicAdapter, isDemo: boolean): Promise<LearningsResult> {
  const res = await generateLearnings(db, ai, { isDemo, recorder: dbCallRecorder(db) });
  if (res.usage) await recordAiCost(db, { usage: res.usage, rates: await loadAiRates(db), isMock: res.isMock || isDemo, evidence: `ad_learnings ${res.model ?? ""}` });
  return res;
}
