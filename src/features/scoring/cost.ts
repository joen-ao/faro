import { inArray } from "drizzle-orm";
import { apiCalls, costEntries, costRates } from "@/db/schema";
import type { AppDb } from "@/db/types";
import type { CallRecorder, Usage } from "@/integrations/anthropic";

export interface AiRates {
  /** USD per 1M input tokens */
  inputPer1M: number;
  /** USD per 1M output tokens */
  outputPer1M: number;
}

/** List-price fallback (matches the seed, Sonnet 5.5); real values live in `cost_rates`. */
export const DEFAULT_AI_RATES: AiRates = { inputPer1M: 2, outputPer1M: 10 };

/** F42 · Anthropic list prices per model (USD per 1M tokens, prompts up to 100K). Unknown models use `cost_rates`. */
export const MODEL_RATES: Record<string, AiRates> = {
  "claude-sonnet-5-5": { inputPer1M: 2, outputPer1M: 10 },
  "claude-haiku-5-5": { inputPer1M: 0.1, outputPer1M: 0.5 },
  "claude-opus-5-5": { inputPer1M: 4, outputPer1M: 20 },
};

/** Pure: tokens x per-1M-token rate. */
export function aiCostUsd(usage: Usage, rates: AiRates): number {
  return (usage.input_tokens * rates.inputPer1M + usage.output_tokens * rates.outputPer1M) / 1_000_000;
}

export async function loadAiRates(db: AppDb, model?: string | null): Promise<AiRates> {
  const known = model ? MODEL_RATES[model] : undefined;
  if (known) return known;
  const rows = await db
    .select()
    .from(costRates)
    .where(inArray(costRates.key, ["anthropic_input_per_1m", "anthropic_output_per_1m"]));
  const get = (key: string, d: number) => rows.find((r) => r.key === key)?.usd ?? d;
  return {
    inputPer1M: get("anthropic_input_per_1m", DEFAULT_AI_RATES.inputPer1M),
    outputPer1M: get("anthropic_output_per_1m", DEFAULT_AI_RATES.outputPer1M),
  };
}

export interface AiCostInput {
  leadId?: string | null;
  huntId?: string | null;
  usage: Usage;
  rates: AiRates;
  isMock: boolean;
  evidence: string;
}

/** Inserts a `cost_entries` row (category `ai`). Mock usage is flagged and excluded from real totals. */
export async function recordAiCost(db: AppDb, input: AiCostInput): Promise<number> {
  const usd = aiCostUsd(input.usage, input.rates);
  const quantity = input.usage.input_tokens + input.usage.output_tokens;
  await db.insert(costEntries).values({
    leadId: input.leadId ?? null,
    huntId: input.huntId ?? null,
    category: "ai",
    quantity,
    unit: "tokens",
    rate: quantity > 0 ? usd / quantity : 0,
    usd,
    evidence: input.evidence,
    isMock: input.isMock,
  });
  return usd;
}

/** `api_calls` recorder bound to a database (best-effort: never breaks the AI call). */
export function dbCallRecorder(db: AppDb, huntId?: string | null): CallRecorder {
  return async (r) => {
    try {
      await db.insert(apiCalls).values({
        service: r.service,
        endpoint: r.endpoint,
        huntId: huntId ?? null,
        status: r.status,
        latencyMs: r.latencyMs,
        error: r.error,
        isMock: r.isMock,
      });
    } catch {
      /* logging must not fail the request */
    }
  };
}
