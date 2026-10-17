import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companies } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { DEMO_HUNT_ID, demoScore, ensureDemoHunt, generateDemoRows } from "@/features/hunts/demo";
import { HuntError, countersFromGroups, createHunt, getLeadDetail, getStream, runBatch } from "@/features/hunts/service";
import type { SourceDeps } from "@/features/hunts/sources";
import { ICP_EXAMPLES } from "@/features/icp/presets";
import type { OverpassAdapter } from "@/integrations/overpass";
import type { SourceCompany as OsmCompany } from "@/integrations/overpass/types";
import { createMockSocrata } from "@/integrations/socrata";
import { createTestDb } from "../helpers/test-db";

const criteria = ICP_EXAMPLES[0].criteria;

const osm = (name: string, i: number): OsmCompany => ({
  name,
  lat: 4.6 + i * 0.001,
  lng: -74.1,
  city: "Bogota",
  externalId: `osm:node/${900000 + i}`,
  sourceUrl: `https://www.openstreetmap.org/node/${900000 + i}`,
  license: "ODbL 1.0 © OpenStreetMap contributors",
  sourceChannel: "osm",
  isMock: false,
  raw: { tags: { amenity: "dentist", name } },
});

const adapter = (list: OsmCompany[]): OverpassAdapter => ({
  search: async () => ({ places: [], companies: list, latencyMs: 1, endpoint: "fake", fromCache: false, isMock: false }),
});

let conn: Awaited<ReturnType<typeof createTestDb>>;
let db: AppDb;
beforeAll(async () => {
  conn = await createTestDb();
  db = conn.db as unknown as AppDb;
});
afterAll(async () => {
  await conn.close();
});

describe("review r1 fixes", () => {
  it("never stores or shows names that read like natural persons (OSM), only counts them", async () => {
    const list = ["Dra. Ana María Gómez", "Yanira Cruz", "Consultorio Dr. Pérez", "Clínica Dental Sonreír"].map(osm);
    const deps: SourceDeps = { overpass: adapter(list), socrata: createMockSocrata() };
    const { huntId } = await createHunt(db, { prompt: ICP_EXAMPLES[0].prompt, criteria });
    await runBatch(db, huntId, "osm", undefined, deps);
    const s = await getStream(db, huntId);
    expect(s.points.map((p) => p.name).sort()).toEqual(["Clínica Dental Sonreír", "Consultorio Dr. Pérez"]);
    expect(s.sources.osm?.excludedPersonal).toBe(2);
    const names = (await db.select({ n: companies.name }).from(companies)).map((r) => r.n);
    expect(names).not.toContain("Dra. Ana María Gómez");
    expect(names).not.toContain("Yanira Cruz");
  });

  it("drawer only returns generic contacts and the profile threshold", async () => {
    await ensureDemoHunt(db);
    const s = await getStream(db, DEMO_HUNT_ID);
    const detail = await getLeadDetail(db, DEMO_HUNT_ID, s.updates[0].id);
    expect(detail.contacts.every((c) => c.isGeneric)).toBe(true);
    expect(detail.threshold).toBe(60);
  });

  it("keeps mock/demo leads out of the real totals and reports them apart", () => {
    const c = countersFromGroups(
      [
        { source: "osm", status: "fit", isDemo: false, n: 5 },
        { source: "osm", status: "found", isDemo: false, n: 10 },
        { source: "rues", status: "fit", isDemo: true, n: 7 },
      ],
      [],
    );
    expect(c.total).toMatchObject({ found: 15, fit: 5 });
    expect(c.test).toMatchObject({ found: 7, fit: 7 });
    expect(c.bySource.rues.found).toBe(7);
    // duplicates of mock rows never reach the real total
    const dup = countersFromGroups([], [{ mergedChannel: "osm" }, { mergedChannel: "rues", isMock: true }, { mergedChannel: "rues", isMock: true }]);
    expect(dup.total.duplicates).toBe(1);
    expect(dup.test?.duplicates).toBe(2);
    const d = countersFromGroups([{ source: "osm", status: "fit", isDemo: true, n: 4 }], [], true);
    expect(d.total.found).toBe(4);
    expect(d.test).toBeNull();
  });

  it("two concurrent runBatch of different sources keep both progress entries and a stable cursor", async () => {
    const list = Array.from({ length: 150 }, (_, i) => osm(`Odontologia Prueba ${i} Norte`, i));
    const deps: SourceDeps = { overpass: adapter(list), socrata: createMockSocrata() };
    const { huntId } = await createHunt(db, { prompt: ICP_EXAMPLES[0].prompt, criteria });
    const [a, b] = await Promise.all([runBatch(db, huntId, "osm", undefined, deps), runBatch(db, huntId, "reps", undefined, deps)]);
    expect(a.newLeads).toBeGreaterThan(0);
    expect(b.newLeads).toBeGreaterThan(0);
    const s = await getStream(db, huntId);
    expect(s.sources.osm?.fetched).toBe(a.fetched);
    expect(s.sources.reps?.fetched).toBe(b.fetched);
    // mock REPS rows are demo-flagged: they never add to the real total
    expect(s.counters.total.found).toBe(a.newLeads);
    expect(s.counters.test?.found).toBe(b.newLeads);
    expect((await getStream(db, huntId, { since: s.cursor })).points).toHaveLength(0);
    await expect(runBatch(db, "00000000-0000-4000-8000-000000000009", "osm", undefined, deps)).rejects.toBeInstanceOf(HuntError);
  });

  it("demo scores follow the scoreFit weights and only legally verified leads advance", () => {
    const rows = generateDemoRows();
    for (const r of rows) {
      expect(r.score).toBe(demoScore(r));
      if (r.status !== "found") {
        expect(r.registry).toBe(true);
        expect(r.nit).not.toBeNull();
        expect(r.score).toBeGreaterThanOrEqual(60);
      }
    }
    for (const s of ["fit", "contacted", "qualified"]) expect(rows.some((r) => r.status === s)).toBe(true);
  });
});
