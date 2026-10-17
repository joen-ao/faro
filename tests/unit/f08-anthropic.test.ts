import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AiCallError,
  AiValidationError,
  complete,
  createMockAnthropic,
  createRealAnthropic,
  extractJson,
  getAnthropic,
  type AnthropicAdapter,
  type CallRecord,
} from "@/integrations/anthropic";
import { mockResponse, taskOf } from "@/integrations/anthropic/mock";
import { parseEnv } from "@/lib/env";

const Schema = z.object({ a: z.number() });

function scripted(replies: string[]): AnthropicAdapter & { calls: string[] } {
  const calls: string[] = [];
  return {
    model: "test",
    isMock: false,
    calls,
    async completeRaw(prompt) {
      calls.push(prompt);
      const text = replies[Math.min(calls.length - 1, replies.length - 1)];
      return { text, usage: { input_tokens: 10, output_tokens: 5 } };
    },
  };
}

describe("complete()", () => {
  it("validates JSON, tolerates fences, returns usage", async () => {
    const ai = scripted(['```json\n{"a": 1}\n```']);
    const r = await complete(ai, "p", Schema);
    expect(r.data).toEqual({ a: 1 });
    expect(r.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
    expect(r.is_mock).toBe(false);
  });

  it("retries once on malformed JSON and sums usage", async () => {
    const ai = scripted(["not json at all", '{"a": 2}']);
    const records: CallRecord[] = [];
    const r = await complete(ai, "p", Schema, { task: "t", recorder: (x) => void records.push(x) });
    expect(r.data.a).toBe(2);
    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1]).toContain("previous reply was invalid");
    expect(r.usage).toEqual({ input_tokens: 20, output_tokens: 10 });
    expect(records.map((x) => x.status)).toEqual([422, 200]);
    expect(records[0].endpoint).toBe("t");
  });

  it("retries on schema violations then throws a handled error", async () => {
    const ai = scripted(['{"a": "x"}']);
    const err = await complete(ai, "p", Schema).catch((e) => e);
    expect(err).toBeInstanceOf(AiValidationError);
    expect(err.usage.input_tokens).toBe(20);
    expect(ai.calls).toHaveLength(2);
  });

  it("wraps adapter failures", async () => {
    const ai: AnthropicAdapter = { model: "x", isMock: false, completeRaw: async () => Promise.reject(new Error("boom")) };
    const records: CallRecord[] = [];
    await expect(complete(ai, "p", Schema, { recorder: (r) => void records.push(r) })).rejects.toBeInstanceOf(AiCallError);
    expect(records[0].status).toBe(502);
  });

  it("extractJson rejects text without an object", () => {
    expect(() => extractJson("nothing")).toThrow();
  });
});

describe("mock adapter", () => {
  it("is deterministic and flagged mock", async () => {
    const ai = createMockAnthropic();
    const prompt = "[[task:icp_parse]]\nUSER_INPUT:\nClinicas dentales en Bogota";
    const a = await ai.completeRaw(prompt);
    const b = await ai.completeRaw(prompt);
    expect(a).toEqual(b);
    expect(ai.isMock).toBe(true);
    expect(taskOf(prompt)).toBe("icp_parse");
    expect(taskOf("x")).toBeNull();
  });

  it("unknown task yields stable hash output", () => {
    expect(mockResponse("hello")).toBe(mockResponse("hello"));
    expect(mockResponse("hello")).not.toBe(mockResponse("hello2"));
  });

  it("signals: finds keywords in text, tolerates bad payload", () => {
    const ok = JSON.parse(
      mockResponse(`[[task:score_signals]]\nPAYLOAD:\n${JSON.stringify({ signals: ["agenda en linea", "telemedicina"], text: "Reserve su agenda en linea hoy" })}`),
    );
    expect(ok.signals[0].found).toBe(true);
    expect(ok.signals[1].found).toBe(false);
    const bad = JSON.parse(mockResponse("[[task:score_signals]]\nPAYLOAD:\n{oops"));
    expect(bad.signals).toEqual([]);
  });
});

describe("real adapter + factory", () => {
  it("calls the SDK client and maps usage", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: '{"a":1}' }, { type: "thinking", thinking: "" }],
      usage: { input_tokens: 7, output_tokens: 3 },
    });
    const ai = createRealAnthropic({ apiKey: "k", client: { messages: { create } } as never });
    expect(ai.model).toBe("claude-sonnet-5-5");
    const r = await complete(ai, "p", Schema);
    expect(r.data.a).toBe(1);
    expect(r.usage).toEqual({ input_tokens: 7, output_tokens: 3 });
    expect(create.mock.calls[0][0].model).toBe("claude-sonnet-5-5");
  });

  it("constructs a real SDK client when none is injected", () => {
    const ai = createRealAnthropic({ apiKey: "sk-test", model: "m" });
    expect(ai.model).toBe("m");
  });

  it("getAnthropic falls back to mock without a key and honours mode+key", () => {
    expect(getAnthropic(parseEnv({})).isMock).toBe(true);
    expect(getAnthropic(parseEnv({ ANTHROPIC_MODE: "real" })).isMock).toBe(true);
    const real = getAnthropic(parseEnv({ ANTHROPIC_MODE: "real", ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_MODEL: "claude-x" }));
    expect(real.isMock).toBe(false);
    expect(real.model).toBe("claude-x");
  });
});
