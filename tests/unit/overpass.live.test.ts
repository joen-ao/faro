import { describe, expect, it } from "vitest";
import { createRealOverpass, queryFromCriteria } from "@/integrations/overpass/real";

/** Manual test against the real public Overpass API. Run: RUN_LIVE=1 npx vitest run tests/unit/overpass.live.test.ts */
describe.skipIf(!process.env.RUN_LIVE)("overpass live (Bogotá dentists)", () => {
  it("fetches real companies", async () => {
    const adapter = createRealOverpass({ cacheDir: ".cache/overpass" });
    const r = await adapter.search(queryFromCriteria({ tags: ["amenity=dentist", "healthcare=dentist"], city: "Bogotá" }, 120));
    const withPhone = r.companies.filter((c) => c.phone).length;
    const withWeb = r.companies.filter((c) => c.website).length;
    console.log(`LIVE_RESULT companies=${r.companies.length} places=${r.places.length} phoneE164=${withPhone} web=${withWeb} endpoint=${r.endpoint} fromCache=${r.fromCache} latencyMs=${r.latencyMs}`);
    expect(r.isMock).toBe(false);
    expect(r.companies.length).toBeGreaterThan(20);
    expect(r.companies[0].sourceUrl).toMatch(/^https:\/\/www\.openstreetmap\.org\/(node|way)\/\d+$/);
  }, 180_000);
});
