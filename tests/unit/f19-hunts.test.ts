import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hunts, leads } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { BATCH_SIZE, allDone, initialSourcesProgress, nextWork, planSources, sliceBatch } from "@/features/hunts/batch";
import { computeCounters, toPointStatus } from "@/features/hunts/counters";
import { DEMO_HUNT_ID, DEMO_POINTS, ensureDemoHunt, generateDemoRows } from "@/features/hunts/demo";
import { estimateSources } from "@/features/hunts/estimates";
import { NO_FILTER, filterPoints, sortForList } from "@/features/hunts/filters";
import { boundsOf, toFeatureCollection } from "@/features/hunts/geojson";
import { HuntError, createHunt, getLeadDetail, getStream, runBatch } from "@/features/hunts/service";
import type { SourceDeps } from "@/features/hunts/sources";
import type { StreamPoint } from "@/features/hunts/types";
import { ICP_EXAMPLES } from "@/features/icp/presets";
import type { OverpassAdapter } from "@/integrations/overpass";
import type { SourceCompany as OsmCompany } from "@/integrations/overpass/types";
import { createMockSocrata } from "@/integrations/socrata";
import { createTestDb } from "../helpers/test-db";

const criteria = ICP_EXAMPLES[0].criteria;

function osmCompanies(n: number): OsmCompany[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Odontologia Prueba ${i} ${["Norte", "Sur", "Centro", "Oriente"][i % 4]}`,
    lat: 4.6 + (i % 50) * 0.002,
    lng: -74.1 + Math.floor(i / 50) * 0.002,
    city: "Bogota",
    website: i % 5 === 0 ? `https://prueba-${i}.example` : undefined,
    externalId: `osm:node/${100000 + i}`,
    sourceUrl: `https://www.openstreetmap.org/node/${100000 + i}`,
    license: "ODbL 1.0 © OpenStreetMap contributors",
    sourceChannel: "osm" as const,
    isMock: false,
    raw: { tags: { amenity: "dentist" } },
  }));
}

const fakeOverpass = (n: number): OverpassAdapter => ({
  async search() {
    return { places: [], companies: osmCompanies(n), latencyMs: 1, endpoint: "fake", fromCache: false, isMock: false };
  },
});

let conn: Awaited<ReturnType<typeof createTestDb>>;
let db: AppDb;
const deps = (n = 450): SourceDeps => ({ overpass: fakeOverpass(n), socrata: createMockSocrata() });

beforeAll(async () => {
  conn = await createTestDb();
  db = conn.db as unknown as AppDb;
});
afterAll(async () => {
  await conn.close();
});

describe("batch planning", () => {
  it("slices a deterministic list by cursor and flags the last batch", () => {
    const list = Array.from({ length: 450 }, (_, i) => i);
    const a = sliceBatch(list, 0);
    const b = sliceBatch(list, a.nextCursor);
    const c = sliceBatch(list, b.nextCursor);
    expect([a.items.length, b.items.length, c.items.length]).toEqual([BATCH_SIZE, BATCH_SIZE, 50]);
    expect([a.done, b.done, c.done]).toEqual([false, false, true]);
    expect(sliceBatch(list, 9999)).toEqual({ items: [], nextCursor: 9999, done: true });
    expect(sliceBatch(list, -5).items[0]).toBe(0);
  });

  it("applies sources by country and sector", () => {
    const co = planSources(criteria);
    expect(co.osm.applicable && co.rues.applicable && co.reps.applicable).toBe(true);
    const miami = planSources(ICP_EXAMPLES[2].criteria);
    expect(miami.osm.applicable).toBe(true);
    expect(miami.rues.applicable).toBe(false);
    expect(miami.reps.reason).toMatch(/Colombia/);
    expect(planSources(ICP_EXAMPLES[1].criteria).reps.applicable).toBe(false);
  });

  it("resumes at the first unfinished source and detects completion", () => {
    const p = initialSourcesProgress(ICP_EXAMPLES[2].criteria);
    expect(p.rues.state).toBe("skipped");
    expect(nextWork(p)).toEqual({ source: "osm", cursor: 0 });
    p.osm = { ...p.osm, state: "running", cursor: 400 };
    expect(nextWork(p)).toEqual({ source: "osm", cursor: 400 });
    expect(allDone(p)).toBe(false);
    p.osm.state = "done";
    expect(nextWork(p)).toBeNull();
    expect(allDone(p)).toBe(true);
  });

  it("estimates from the measured coverage reference only", () => {
    const e = estimateSources(criteria);
    expect(e.find((x) => x.source === "osm")?.estimate).toBe(436);
    expect(estimateSources(ICP_EXAMPLES[2].criteria).find((x) => x.source === "rues")).toMatchObject({ applicable: false, estimate: null });
  });
});

describe("run orchestration", () => {
  it("runs OSM in batches, is idempotent on replay and resumable from the persisted cursor", async () => {
    const { huntId } = await createHunt(db, { prompt: ICP_EXAMPLES[0].prompt, criteria });
    const d = deps(450);
    const r1 = await runBatch(db, huntId, "osm", undefined, d);
    expect(r1).toMatchObject({ cursor: 0, nextCursor: 200, done: false, newLeads: 200, total: 450 });

    // same cursor again: nothing new
    const replay = await runBatch(db, huntId, "osm", 0, d);
    expect(replay.newLeads).toBe(0);

    // "crash": resume without a cursor -> continues from hunts.progress
    const r2 = await runBatch(db, huntId, "osm", undefined, d);
    expect(r2).toMatchObject({ cursor: 200, nextCursor: 400, newLeads: 200 });
    const r3 = await runBatch(db, huntId, "osm", undefined, d);
    expect(r3).toMatchObject({ done: true, newLeads: 50 });

    const [h] = await db.select().from(hunts).where(eq(hunts.id, huntId));
    const sources = (h.progress as { sources: Record<string, { state: string; fetched: number; log: unknown[] }> }).sources;
    expect(sources.osm.state).toBe("done");
    expect(sources.osm.log.length).toBeGreaterThan(0);
    expect(await db.select().from(leads).where(eq(leads.huntId, huntId))).toHaveLength(450);
  });

  it("rejects skipped sources, unknown hunts and reports source failures without losing progress", async () => {
    const miami = await createHunt(db, { prompt: "Restaurants in Miami", criteria: ICP_EXAMPLES[2].criteria });
    await expect(runBatch(db, miami.huntId, "rues", undefined, deps())).rejects.toMatchObject({ status: 409 });
    await expect(runBatch(db, "00000000-0000-4000-8000-000000000001", "osm", undefined, deps())).rejects.toBeInstanceOf(HuntError);
    const broken: SourceDeps = { ...deps(), overpass: { search: async () => Promise.reject(new Error("overpass 504")) } };
    await expect(runBatch(db, miami.huntId, "osm", undefined, broken)).rejects.toMatchObject({ status: 502 });
    const s = await getStream(db, miami.huntId);
    expect(s.sources.osm).toMatchObject({ state: "error", cursor: 0 });
    expect(s.sources.osm?.error).toContain("overpass 504");
  });

  it("streams incrementally with since, counters and lead detail", async () => {
    const { huntId } = await createHunt(db, { prompt: ICP_EXAMPLES[0].prompt, criteria });
    const d = deps(300);
    await runBatch(db, huntId, "osm", undefined, d);
    const first = await getStream(db, huntId);
    expect(first.points).toHaveLength(200);
    expect(first.hasMore).toBe(false);
    expect(first.counters.total.found).toBe(200);
    expect(first.counters.bySource.osm.found).toBe(200);
    expect(first.points[0]).toMatchObject({ source: "osm", status: "found" });

    const none = await getStream(db, huntId, { since: first.cursor, rev: first.rev });
    expect(none.points).toHaveLength(0);
    expect(none.updates).toHaveLength(0);

    await runBatch(db, huntId, "osm", undefined, d);
    const next = await getStream(db, huntId, { since: first.cursor, rev: first.rev });
    expect(next.points).toHaveLength(100);
    expect(next.cursor).toBeGreaterThan(first.cursor);

    // paging never splits rows sharing a timestamp
    const paged = await getStream(db, huntId, { limit: 50 });
    expect(paged.hasMore).toBe(true);
    expect(paged.points.length).toBeGreaterThan(0);

    const detail = await getLeadDetail(db, huntId, first.points[0].id);
    expect(detail.sources[0]).toMatchObject({ channel: "osm", license: expect.stringContaining("ODbL") });
    expect(detail.fit?.criteria).toBeInstanceOf(Array);
    await expect(getLeadDetail(db, huntId, "00000000-0000-4000-8000-000000000002")).rejects.toMatchObject({ status: 404 });
  });

  it("runs the mock registry sources through the same batch path", async () => {
    const { huntId } = await createHunt(db, { prompt: ICP_EXAMPLES[0].prompt, criteria });
    const rues = await runBatch(db, huntId, "rues", undefined, deps());
    const reps = await runBatch(db, huntId, "reps", undefined, deps());
    expect(rues.done && reps.done).toBe(true);
    const s = await getStream(db, huntId);
    expect(s.counters.total.found).toBe(0); // mock rows never count as real
    expect(s.counters.test?.found).toBe(rues.newLeads + reps.newLeads);
    expect(s.points.every((p) => p.lat === null || typeof p.lat === "number")).toBe(true);
  });
});

describe("map transforms", () => {
  const pts = (n: number): StreamPoint[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      lat: i % 10 === 0 ? null : 4.6 + (i % 100) * 0.001,
      lng: i % 10 === 0 ? null : -74.1 + (i % 77) * 0.001,
      status: (["found", "fit", "contacted", "qualified"] as const)[i % 4],
      source: ["osm", "rues", "reps"][i % 3],
      name: `Clínica Ñandú ${i}`,
      score: i % 100,
    }));

  it("builds GeoJSON only for located points", () => {
    const fc = toFeatureCollection(pts(100));
    expect(fc.features).toHaveLength(90);
    expect(fc.features[0].geometry.coordinates).toHaveLength(2);
    expect(boundsOf(pts(100))).not.toBeNull();
    expect(boundsOf([])).toBeNull();
  });

  it("transforms 2.000 points in under 50 ms", () => {
    const data = pts(2000);
    toFeatureCollection(data); // warm up
    const t = performance.now();
    const fc = toFeatureCollection(data);
    const ms = performance.now() - t;
    expect(fc.features.length).toBe(1800);
    expect(ms).toBeLessThan(50);
  });

  it("computes counters per source with fused duplicates", () => {
    const c = computeCounters(pts(40), [{ mergedChannel: "rues" }, { mergedChannel: "osm" }, { mergedChannel: "rues" }]);
    expect(c.total).toMatchObject({ found: 40, fit: 30, contacted: 20, qualified: 10, duplicates: 3 });
    expect(c.bySource.rues.duplicates).toBe(2);
    expect(Object.values(c.bySource).reduce((a, s) => a + s.found, 0)).toBe(40);
    expect(toPointStatus("responded")).toBe("contacted");
    expect(toPointStatus("opted_out")).toBe("found");
  });

  it("filters by text (accent-insensitive), source, status and location, and sorts advanced first", () => {
    const data = pts(60);
    expect(filterPoints(data, { ...NO_FILTER, query: "nandu 7" }).map((p) => p.id)).toEqual(["p7"]);
    expect(filterPoints(data, { ...NO_FILTER, sources: new Set(["osm"]) }).every((p) => p.source === "osm")).toBe(true);
    expect(filterPoints(data, { ...NO_FILTER, statuses: new Set(["qualified"]) })).toHaveLength(15);
    expect(filterPoints(data, { ...NO_FILTER, onlyLocated: true })).toHaveLength(54);
    const sorted = sortForList(data);
    expect(sorted[0].status).toBe("qualified");
    expect(sorted[sorted.length - 1].status).toBe("found");
  });
});

describe("demo hunt", () => {
  it("generates a deterministic dataset with all four states and unlocated rows", () => {
    const a = generateDemoRows();
    expect(a).toEqual(generateDemoRows());
    expect(a.filter((r) => r.lat !== null)).toHaveLength(DEMO_POINTS);
    for (const s of ["found", "fit", "contacted", "qualified"]) expect(a.some((r) => r.status === s)).toBe(true);
    expect(a.every((r) => r.lat === null || (r.lat > 4.4 && r.lat < 4.9 && r.lng! > -74.3 && r.lng! < -73.9))).toBe(true);
  });

  it("seeds an idempotent, fully-demo hunt streamed in pages", async () => {
    await ensureDemoHunt(db);
    await ensureDemoHunt(db);
    const all: StreamPoint[] = [];
    let since = 0;
    let rev: string | undefined;
    for (let i = 0; i < 5; i++) {
      const s = await getStream(db, DEMO_HUNT_ID, { since, rev, limit: 1000 });
      all.push(...s.points);
      since = s.cursor;
      rev = s.rev;
      expect(s.isDemo).toBe(true);
      if (!s.hasMore) break;
    }
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    expect(all.filter((p) => p.lat !== null).length).toBeGreaterThanOrEqual(2000);
    const s = await getStream(db, DEMO_HUNT_ID);
    expect(s.duplicates.merged).toBeGreaterThan(0);
    expect(s.counters.total.qualified).toBeGreaterThan(0);
    const adv = s.updates.find((u) => u.status === "qualified");
    const detail = await getLeadDetail(db, DEMO_HUNT_ID, adv!.id);
    expect(detail.lead.isDemo).toBe(true);
    expect(detail.costs.length).toBeGreaterThan(0);
    expect(detail.events.map((e) => e.type)).toContain("qualified");
  });
});
