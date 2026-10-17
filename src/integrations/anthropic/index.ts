import type { z } from "zod";
import { getEnv, resolveMode, type Env } from "@/lib/env";
import { createMockAnthropic } from "./mock";
import { createRealAnthropic } from "./real";
import {
  AiCallError,
  AiValidationError,
  type AnthropicAdapter,
  type CallRecorder,
  type CompleteResult,
  type Usage,
} from "./types";

export * from "./types";
export { DEFAULT_ANTHROPIC_MODEL, createRealAnthropic } from "./real";
export { createMockAnthropic } from "./mock";

export function getAnthropic(env: Env = getEnv()): AnthropicAdapter {
  if (resolveMode("anthropic", env) === "mock") return createMockAnthropic();
  return createRealAnthropic({ apiKey: env.ANTHROPIC_API_KEY ?? "", model: env.ANTHROPIC_MODEL });
}

/** Pulls the first JSON object out of a model reply (tolerates code fences / prose). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export interface CompleteOptions {
  /** Label stored in api_calls.endpoint, e.g. "icp_parse". */
  task?: string;
  recorder?: CallRecorder;
  /** Total attempts (default 2 = one retry). */
  maxAttempts?: number;
}

/** Calls the model and returns Zod-validated JSON plus the summed token usage. */
export async function complete<T>(
  adapter: AnthropicAdapter,
  prompt: string,
  schema: z.ZodType<T>,
  opts: CompleteOptions = {},
): Promise<CompleteResult<T>> {
  const attempts = Math.max(1, opts.maxAttempts ?? 2);
  const total: Usage = { input_tokens: 0, output_tokens: 0 };
  let lastError = "unknown";
  let currentPrompt = prompt;
  for (let i = 0; i < attempts; i++) {
    const started = Date.now();
    let status = 200;
    let error: string | null = null;
    try {
      let raw;
      try {
        raw = await adapter.completeRaw(currentPrompt);
      } catch (e) {
        status = 502;
        error = e instanceof Error ? e.message : String(e);
        throw new AiCallError(`anthropic call failed: ${error}`);
      }
      total.input_tokens += raw.usage.input_tokens;
      total.output_tokens += raw.usage.output_tokens;
      try {
        const parsed = schema.safeParse(extractJson(raw.text));
        if (parsed.success) {
          return { data: parsed.data, usage: total, model: adapter.model, is_mock: adapter.isMock };
        }
        lastError = parsed.error.issues.map((x) => `${x.path.join(".") || "(root)"}: ${x.message}`).join("; ");
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
      status = 422;
      error = lastError;
      currentPrompt = `${prompt}\n\nYour previous reply was invalid (${lastError.slice(0, 300)}). Reply again with ONLY a valid JSON object matching the requested shape.`;
    } finally {
      await opts.recorder?.({
        service: "anthropic",
        endpoint: opts.task ?? "complete",
        status,
        latencyMs: Date.now() - started,
        error,
        isMock: adapter.isMock,
      });
    }
  }
  throw new AiValidationError(
    `AI reply failed validation after ${attempts} attempts: ${lastError}`,
    total,
    adapter.model,
    adapter.isMock,
  );
}
