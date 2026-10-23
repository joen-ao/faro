import { describe, expect, it } from "vitest";
import { fetchBatch, REGISTRY_MAX_PER_CITY } from "@/features/hunts/sources";
import { ICP_EXAMPLES } from "@/features/icp/presets";
import { createMockSocrata } from "@/integrations/socrata";

describe("registry cap per city", () => {
  it("ends RUES at the cap so huge sectors (lawyers in Bogotá) always finish", async () => {
    const deps = { socrata: createMockSocrata() } as never;
    const r = await fetchBatch("h", "rues", ICP_EXAMPLES[0].criteria, REGISTRY_MAX_PER_CITY, deps);
    expect(r).toMatchObject({ done: true, companies: [], nextCursor: REGISTRY_MAX_PER_CITY });
  });
});
