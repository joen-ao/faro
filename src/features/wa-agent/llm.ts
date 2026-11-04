import Anthropic from "@anthropic-ai/sdk";
import { getEnv, resolveMode, type Env } from "@/lib/env";

/** F44 eval (2026-11-04): Haiku 5.5 passed every check at ~USD 0,002 per conversation vs ~USD 0,037 for Sonnet 5.5. */
export const DEFAULT_WA_AGENT_MODEL = "claude-haiku-5-5";

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface LlmRequest {
  /** [cached stable prompt, per-turn context] */
  system: { stable: string; dynamic: string };
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
}

export interface LlmResponse {
  content: Anthropic.ContentBlock[];
  stopReason: string | null;
  usage: LlmUsage;
}

export interface AgentLlm {
  readonly model: string;
  readonly isMock: boolean;
  next(req: LlmRequest): Promise<LlmResponse>;
}

type MessagesClient = { messages: { create(args: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> } };

export function createRealAgentLlm(opts: { apiKey: string; model?: string; client?: MessagesClient }): AgentLlm {
  const model = opts.model || DEFAULT_WA_AGENT_MODEL;
  const client: MessagesClient = opts.client ?? new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 45_000 });
  return {
    model,
    isMock: false,
    async next(req) {
      const res = await client.messages.create({
        model,
        max_tokens: 1024,
        // The stable prompt (role, catalog, rules) is the same on every turn: cache it.
        system: [
          { type: "text", text: req.system.stable, cache_control: { type: "ephemeral" } },
          { type: "text", text: req.system.dynamic },
        ],
        tools: req.tools,
        messages: req.messages,
      });
      const u = res.usage;
      return {
        content: res.content,
        stopReason: res.stop_reason,
        usage: {
          input_tokens: u.input_tokens,
          output_tokens: u.output_tokens,
          cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
        },
      };
    },
  };
}

export type ScriptStep = (req: LlmRequest) => LlmResponse | Anthropic.ContentBlock[] | string;

const ZERO: LlmUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

/** Text block helper for scripts and the default mock. */
export const textBlock = (text: string): Anthropic.TextBlock => ({ type: "text", text, citations: null });
export const toolBlock = (name: string, input: Record<string, unknown>, id = `toolu_${name}_${Math.random().toString(36).slice(2, 8)}`): Anthropic.ToolUseBlock => ({
  type: "tool_use",
  id,
  name,
  input,
  caller: { type: "direct" },
} as Anthropic.ToolUseBlock);

/**
 * Mock: plays `script` in order (one step per model call). Without a script it answers with a fixed, honest
 * placeholder so a mock deployment never pretends to be the real agent.
 */
export function createMockAgentLlm(script: ScriptStep[] = []): AgentLlm & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  let i = 0;
  return {
    model: "mock",
    isMock: true,
    calls,
    async next(req) {
      calls.push(req);
      const step = script[i++];
      const out = step ? step(req) : "Gracias por escribir a Mokub. (Agente en modo de prueba.) ¿En qué le puedo ayudar?";
      if (typeof out === "string") return { content: [textBlock(out)], stopReason: "end_turn", usage: { ...ZERO, input_tokens: 100, output_tokens: 20 } };
      if (Array.isArray(out)) {
        const usesTool = out.some((b) => b.type === "tool_use");
        return { content: out, stopReason: usesTool ? "tool_use" : "end_turn", usage: { ...ZERO, input_tokens: 100, output_tokens: 20 } };
      }
      return out;
    },
  };
}

export function getAgentLlm(env: Env = getEnv()): AgentLlm {
  if (resolveMode("anthropic", env) === "mock") return createMockAgentLlm();
  return createRealAgentLlm({ apiKey: env.ANTHROPIC_API_KEY ?? "", model: env.ANTHROPIC_WA_AGENT_MODEL || DEFAULT_WA_AGENT_MODEL });
}
