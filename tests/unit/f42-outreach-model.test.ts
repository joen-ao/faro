import { describe, expect, it } from "vitest";
import { DEFAULT_OUTREACH_MODEL, getAnthropic, getOutreachAnthropic } from "@/integrations/anthropic";
import { parseEnv } from "@/lib/env";

describe("F42 · outreach emails use their own model", () => {
  const real = parseEnv({ ANTHROPIC_MODE: "real", ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_MODEL: "claude-sonnet-5-5" });
  it("defaults to Haiku 5.5 for emails and keeps ANTHROPIC_MODEL for the rest", () => {
    expect(DEFAULT_OUTREACH_MODEL).toBe("claude-haiku-5-5");
    expect(getOutreachAnthropic(real).model).toBe("claude-haiku-5-5");
    expect(getAnthropic(real).model).toBe("claude-sonnet-5-5");
  });
  it("ANTHROPIC_OUTREACH_MODEL overrides the email model", () => {
    expect(getOutreachAnthropic({ ...real, ANTHROPIC_OUTREACH_MODEL: "claude-sonnet-5-5" }).model).toBe("claude-sonnet-5-5");
  });
  it("mock mode stays mock", () => {
    expect(getOutreachAnthropic(parseEnv({ ANTHROPIC_MODE: "mock" })).isMock).toBe(true);
  });
});
