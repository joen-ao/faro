import { describe, expect, it } from "vitest";
import { parseIcp } from "@/features/icp";
import type { AnthropicAdapter } from "@/integrations/anthropic";

describe("ICP without a place", () => {
  it("defaults to Bogotá, CO instead of failing the whole profile", async () => {
    const ai: AnthropicAdapter = {
      model: "claude-test",
      isMock: false,
      completeRaw: async () => ({
        text: JSON.stringify({ sector: "Clínicas dermatológicas y spas", ciiu: ["8622"], osmTags: ["leisure=spa"], placesTypes: [], city: "", country: "", signals: [], exclusions: [], language: "es" }),
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    };
    const r = await parseIcp("clinicas dermatologicas o spas", ai);
    expect(r.criteria.city).toBe("Bogota");
    expect(r.criteria.country).toBe("CO");
    expect(r.criteria.bbox).toBeDefined();
  });
});
