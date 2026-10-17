import { describe, expect, it } from "vitest";
import { handleIcpParse } from "@/features/icp/api";
import { enrichCriteria, ICP_EXAMPLES, IcpCriteria, mockIcpCriteria, parseIcp } from "@/features/icp";
import { createMockAnthropic, type AnthropicAdapter, type CallRecord } from "@/integrations/anthropic";

describe("ICP presets", () => {
  it("examples validate against the schema with known criteria", () => {
    expect(ICP_EXAMPLES.map((e) => e.id)).toEqual(["bogota-dental", "bogota-restaurantes", "miami-restaurants"]);
    for (const e of ICP_EXAMPLES) expect(IcpCriteria.safeParse(e.criteria).success).toBe(true);
    const dental = ICP_EXAMPLES[0].criteria;
    expect(dental.ciiu).toEqual(["8622"]);
    expect(dental.osmTags).toContain("amenity=dentist");
    expect(ICP_EXAMPLES[2].criteria).toMatchObject({ city: "Miami", country: "US", language: "en" });
  });

  it("keyword fallback maps sector and city; unknown sector is general", () => {
    const c = mockIcpCriteria("Quiero odontologos en Bogota con agenda online");
    expect(c.sector).toBe("dental");
    expect(c.signals).toContain("agenda en linea");
    expect(mockIcpCriteria("ferreterias").sector).toBe("general");
  });

  it("enrichCriteria fills empty fields and uses verified CIIU for known sectors", () => {
    const base = IcpCriteria.parse({ sector: "dental", city: "Bogota" });
    const e = enrichCriteria(base, "clinicas dentales en Bogota");
    expect(e.ciiu).toEqual(["8622"]);
    expect(e.bbox).toBeDefined();
    expect(enrichCriteria({ ...base, ciiu: ["1111"] }, "dental").ciiu).toEqual(["8622"]);
    const unknown = IcpCriteria.parse({ sector: "ferreterias", city: "Bogota" });
    expect(enrichCriteria({ ...unknown, ciiu: ["4752"] }, "ferreterias").ciiu).toEqual(["4752"]);
  });
});

describe("parseIcp / POST /api/icp/parse handler (mock)", () => {
  it("is deterministic", async () => {
    const ai = createMockAnthropic();
    const a = await parseIcp("Clinicas dentales en Bogota que tengan sitio web", ai);
    const b = await parseIcp("Clinicas dentales en Bogota que tengan sitio web", ai);
    expect(a).toEqual(b);
    expect(a.is_mock).toBe(true);
    expect(a.threshold).toBe(60);
    expect(a.usage.input_tokens).toBeGreaterThan(0);
  });

  it("returns 200 with criteria and records the call", async () => {
    const records: CallRecord[] = [];
    const res = await handleIcpParse({ prompt: "Restaurants in Miami with their own website" }, { ai: createMockAnthropic(), recorder: (r) => void records.push(r) });
    expect(res.status).toBe(200);
    expect((res.body as { criteria: { city: string } }).criteria.city).toBe("Miami");
    expect(records[0]).toMatchObject({ service: "anthropic", endpoint: "icp_parse", isMock: true });
  });

  it("returns 400 for invalid bodies", async () => {
    for (const bad of [{}, { prompt: "" }, { prompt: 5 }, null]) {
      const res = await handleIcpParse(bad, { ai: createMockAnthropic() });
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toBeTruthy();
    }
  });

  it("returns 502 when the AI keeps returning garbage", async () => {
    const ai: AnthropicAdapter = { model: "x", isMock: false, completeRaw: async () => ({ text: "garbage", usage: { input_tokens: 1, output_tokens: 1 } }) };
    expect((await handleIcpParse({ prompt: "dentistas en Bogota" }, { ai })).status).toBe(502);
    const down: AnthropicAdapter = { model: "x", isMock: false, completeRaw: async () => Promise.reject(new Error("down")) };
    expect((await handleIcpParse({ prompt: "dentistas en Bogota" }, { ai: down })).status).toBe(502);
  });
});

describe("verified CIIU for known sectors", () => {
  it("replaces the model's CIIU guess with the RUES-verified code", async () => {
    const { enrichCriteria } = await import("@/features/icp");
    const c = enrichCriteria(
      { sector: "Clínicas dentales", ciiu: ["8623"], osmTags: ["amenity=dentist"], placesTypes: ["dentist"], city: "Bogotá", country: "CO", signals: [], exclusions: [], language: "es" } as never,
      "Clínicas odontológicas en Bogotá",
    );
    expect(c.ciiu).toEqual(["8622"]);
  });
});
