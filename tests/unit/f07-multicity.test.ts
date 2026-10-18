import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hunts, leads } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { benchmarkPeers, computeBenchmark, resolveHuntCity, type PeerSite } from "@/features/diagnostic/benchmark";
import { siteFactsFrom } from "@/features/diagnostic/findings";
import { initialSourcesProgress, nextWork } from "@/features/hunts/batch";
import { estimateSources } from "@/features/hunts/estimates";
import { listHunts } from "@/features/hunts/list";
import { areaBounds, unionBounds } from "@/features/hunts/geojson";
import { createHunt, getStream, runBatch } from "@/features/hunts/service";
import type { SourceDeps } from "@/features/hunts/sources";
import type { HuntSourcesProgress } from "@/features/hunts/types";
import {
  CITIES,
  ICP_EXAMPLES,
  IcpCriteria,
  areaLabel,
  areaList,
  countryCities,
  enrichCriteria,
  findCities,
  findCity,
  huntCities,
  mockIcpCriteria,
  normalizeCities,
  parseIcp,
  sameCity,
  withCities,
} from "@/features/icp";
import { scoreFit, type ScoreCompany } from "@/features/scoring/fit";
import { createMockAnthropic } from "@/integrations/anthropic";
import type { OverpassAdapter } from "@/integrations/overpass";
import type { OverpassQuery, SourceCompany as OsmCompany } from "@/integrations/overpass/types";
import { createMockSocrata, repsWhere } from "@/integrations/socrata";
import { createTestDb } from "../helpers/test-db";

const city = (name: string) => findCity(name)!;
const dental = ICP_EXAMPLES[0].criteria;

describe("criteria schema (backwards compatible)", () => {
  it("parses old single-city criteria unchanged and keeps city = first city", () => {
    const old = IcpCriteria.parse({ sector: "dental", city: "Bogota", bbox: [4.45, -74.25, 4.84, -73.99] });
    expect(old.cities).toBeUndefined();
    expect(huntCities(old)).toEqual([{ name: "Bogota", bbox: [4.45, -74.25, 4.84, -73.99] }]);
    expect(normalizeCities(old)).toEqual(old);
    const multi = IcpCriteria.parse({ ...dental, cities: [{ name: "Medellin" }, { name: "Cali" }] });
    const n = normalizeCities(multi);
    expect(n.city).toBe("Medellin");
    expect(n.bbox).toEqual(city("medellin").bbox);
    expect(n.cities?.map((c) => c.name)).toEqual(["Medellin", "Cali"]);
    expect(n.cities?.[1].bbox).toEqual(city("cali").bbox);
    expect(n.scope).toBe("cities");
  });

  it("caps at 5 cities, dedupes aliases and drops `cities` when only one is left", () => {
    const six = IcpCriteria.parse({ sector: "x", city: "Bogota", cities: ["Bogota", "Medellin", "Cali", "Barranquilla", "Cartagena", "Miami"].map((name) => ({ name })) });
    expect(six.cities).toHaveLength(5);
    const dup = normalizeCities(IcpCriteria.parse({ sector: "x", city: "Bogotá", cities: [{ name: "Bogotá" }, { name: "BOGOTA" }] }));
    expect(dup.cities).toBeUndefined();
    expect(dup.city).toBe("Bogota");
    expect(IcpCriteria.safeParse({ sector: "x", city: "Bogota", cities: [{ name: "" }] }).success).toBe(false);
  });

  it("matches whole words only: 'calidad' is not Cali", () => {
    expect(findCity("restaurantes de calidad")).toBeUndefined();
    expect(findCities("dentistas en Bogotá, Medellín y Cali").map((c) => c.city)).toEqual(["Bogota", "Medellin", "Cali"]);
    expect(findCities("Cali y luego Bogotá").map((c) => c.city)).toEqual(["Cali", "Bogota"]);
    expect(sameCity("Medellin Para Antioquia", "Medellín")).toBe(true);
    expect(sameCity("Bogota", "Cali")).toBe(false);
  });
});

describe("country expansion and parsing", () => {
  it("Colombia / todo el país expand to the 5 main preset cities with DANE codes and RUES chambers", () => {
    const co = countryCities("CO");
    expect(co.map((c) => c.city)).toEqual(["Bogota", "Medellin", "Cali", "Barranquilla", "Cartagena"]);
    expect(co.every((c) => /^\d{5}$/.test(c.dane!) && !!c.camara)).toBe(true);
    for (const text of ["Clínicas dentales en Colombia", "clinicas dentales en todo el país"]) {
      const c = mockIcpCriteria(text);
      expect(c.scope).toBe("country");
      expect(c.cities?.map((x) => x.name)).toEqual(["Bogota", "Medellin", "Cali", "Barranquilla", "Cartagena"]);
      expect(c.city).toBe("Bogota");
      expect(c.cities?.every((x) => x.bbox)).toBe(true);
    }
    // US: only the existing preset list (Miami).
    expect(countryCities("US").map((c) => c.city)).toEqual(["Miami"]);
    // A city named next to the country is a single-city search.
    expect(mockIcpCriteria("dentistas en Bogotá, Colombia").cities).toBeUndefined();
  });

  it("mock parse returns `cities` when the text names several cities; enrichCriteria expands a model country", async () => {
    const p = await parseIcp("Clínicas dentales en Bogotá, Medellín y Cali", createMockAnthropic());
    expect(p.criteria.cities?.map((c) => c.name)).toEqual(["Bogota", "Medellin", "Cali"]);
    expect(p.criteria.city).toBe("Bogota");
    expect(p.criteria.ciiu).toEqual(["8622"]);
    // the model answered with the country as the city
    const model = IcpCriteria.parse({ sector: "dental", city: "Colombia", country: "CO" });
    const e = enrichCriteria(model, "odontologías en Colombia");
    expect(e).toMatchObject({ scope: "country", city: "Bogota" });
    expect(e.cities).toHaveLength(5);
    // the model gave one city, the text names two: fill `cities`
    const one = enrichCriteria(IcpCriteria.parse({ sector: "dental", city: "Medellín" }), "dentistas en Medellín y Barranquilla");
    expect(one.cities?.map((c) => c.name)).toEqual(["Medellin", "Barranquilla"]);
    expect(one.bbox).toEqual(city("medellin").bbox);
    // single city: same shape as before
    expect(enrichCriteria(IcpCriteria.parse({ sector: "dental", city: "Bogota" }), "dentistas en Bogota").cities).toBeUndefined();
  });

  it("labels: list and compact", () => {
    const three = withCities(dental, [city("bogota"), city("medellin"), city("cali")]);
    expect(areaList(three)).toBe("Bogotá, Medellín y Cali");
    expect(areaLabel(three)).toBe("Bogotá +2");
    expect(areaLabel(withCities(dental, countryCities("CO"), "country"))).toBe("Colombia (5 ciudades)");
    expect(areaLabel({ city: "bogota" })).toBe("Bogotá");
    expect(areaLabel({})).toBeNull();
  });
});

describe("estimates per city", () => {
  it("sums measured references per city and never invents one (OSM unmeasured outside Bogotá)", () => {
    const e = estimateSources(withCities(dental, [city("bogota"), city("medellin"), city("cali")]));
    expect(e.find((x) => x.source === "rues")?.estimate).toBe(1445 + 362 + 384);
    expect(e.find((x) => x.source === "reps")?.estimate).toBe(241 + 82 + 86);
    expect(e.find((x) => x.source === "osm")).toMatchObject({ applicable: true, estimate: null, basis: "Sin referencia medida" });
    expect(estimateSources(dental).find((x) => x.source === "osm")?.estimate).toBe(436);
  });

  it("REPS filters by DANE code when the city has one", () => {
    expect(repsWhere({ municipio: "Medellin", municipioCode: "05001" })).toContain("municipiosede='05001'");
    expect(() => repsWhere({ municipio: "x", municipioCode: "5001'--" })).toThrow();
  });

  it("frames all the cities on the map", () => {
    const b = areaBounds([{ bbox: city("bogota").bbox }, { bbox: city("barranquilla").bbox }, {}]);
    expect(b).toEqual([-74.9, 4.45, -73.99, 11.05]);
    expect(unionBounds(null, b)).toEqual(b);
    expect(unionBounds([-80, 0, -70, 5], b)).toEqual([-80, 0, -70, 11.05]);
  });
});

/* ---------- runBatch over several cities ---------- */

function osm(id: number, cityName: string, lat: number, lng: number): OsmCompany {
  return {
    name: `Odontologia Prueba ${id} ${["Norte", "Sur", "Centro", "Oriente"][id % 4]}`,
    lat,
    lng,
    city: cityName,
    externalId: `osm:node/${500000 + id}`,
    sourceUrl: `https://www.openstreetmap.org/node/${500000 + id}`,
    license: "ODbL 1.0 © OpenStreetMap contributors",
    sourceChannel: "osm",
    isMock: false,
    raw: { tags: { amenity: "dentist" } },
  };
}

/** Bogotá: 250 places; Medellín: 30 (5 of them already seen in Bogotá -> global dedupe); Cali: none. */
function fakeOverpass(calls: string[]): OverpassAdapter {
  return {
    async search(q: OverpassQuery) {
      const name = CITIES.find((c) => c.bbox[0] === q.bbox?.south)?.city ?? "?";
      calls.push(name);
      const list =
        name === "Bogota"
          ? Array.from({ length: 250 }, (_, i) => osm(i, "Bogota", 4.6 + (i % 50) * 0.002, -74.1 + Math.floor(i / 50) * 0.002))
          : name === "Medellin"
            ? [...Array.from({ length: 25 }, (_, i) => osm(1000 + i, "Medellin", 6.25 + i * 0.002, -75.6)), ...Array.from({ length: 5 }, (_, i) => osm(i, "Bogota", 4.6 + i * 0.002, -74.1))]
            : [];
      return { places: [], companies: list, latencyMs: 1, endpoint: "fake", fromCache: false, isMock: false };
    },
  };
}

let conn: Awaited<ReturnType<typeof createTestDb>>;
let db: AppDb;
beforeAll(async () => {
  conn = await createTestDb();
  db = conn.db as unknown as AppDb;
});
afterAll(async () => {
  await conn.close();
});

describe("runBatch over several cities", () => {
  const criteria = withCities(dental, [city("bogota"), city("medellin"), city("cali")]);

  it("walks the cities in sequence with a per-city cursor, resumes from the persisted city and dedupes globally", async () => {
    const calls: string[] = [];
    const deps: SourceDeps = { overpass: fakeOverpass(calls), socrata: createMockSocrata() };
    const { huntId, sources } = await createHunt(db, { prompt: "Clínicas dentales en Bogotá, Medellín y Cali", criteria });
    expect(sources.osm).toMatchObject({ state: "pending", city: 0, cursor: 0 });
    expect(sources.osm.cities?.map((c) => c.name)).toEqual(["Bogota", "Medellin", "Cali"]);

    const r1 = await runBatch(db, huntId, "osm", undefined, deps);
    expect(r1).toMatchObject({ city: 0, cursor: 0, nextCity: 0, nextCursor: 200, done: false, newLeads: 200 });
    const r2 = await runBatch(db, huntId, "osm", undefined, deps);
    // Bogotá exhausted: the source moves on to Medellín at offset 0, not done yet.
    expect(r2).toMatchObject({ city: 0, cursor: 200, nextCity: 1, nextCursor: 0, done: false, newLeads: 50 });

    // "crash" after Bogotá: the persisted progress says where to resume.
    const [h] = await db.select().from(hunts).where(eq(hunts.id, huntId));
    const p = (h.progress as { sources: HuntSourcesProgress }).sources;
    expect(p.osm).toMatchObject({ state: "running", city: 1, cursor: 0 });
    expect(nextWork(p)).toEqual({ source: "osm", cursor: 0, city: 1 });

    const r3 = await runBatch(db, huntId, "osm", undefined, deps);
    expect(r3).toMatchObject({ city: 1, nextCity: 2, done: false, fetched: 30, newLeads: 25 });
    // replaying an earlier city is idempotent
    expect((await runBatch(db, huntId, "osm", 0, deps, 0)).newLeads).toBe(0);
    const r4 = await runBatch(db, huntId, "osm", 0, deps, 2);
    expect(r4).toMatchObject({ city: 2, done: true, state: "done", newLeads: 0 });

    // Overpass ran once per city, in order (memoised per city), never in parallel.
    expect(calls).toEqual(["Bogota", "Medellin", "Cali"]);
    expect(await db.select().from(leads).where(eq(leads.huntId, huntId))).toHaveLength(275);

    const s = await getStream(db, huntId);
    expect(s.sources.osm).toMatchObject({ state: "done", fetched: 250 + 200 + 30 + 0, total: 280 });
    expect(s.sources.osm?.cities?.map((c) => [c.state, c.total])).toEqual([
      ["done", 250],
      ["done", 30],
      ["done", 0],
    ]);
    expect(s.counters.bySource.osm.found).toBe(275);
    expect(s.cities.map((c) => c.name)).toEqual(["Bogota", "Medellin", "Cali"]);
    expect(s.area).toBe("Bogotá +2");
    expect((await listHunts(db)).find((x) => x.id === huntId)).toMatchObject({ city: "Bogota", area: "Bogotá +2" });
    await expect(runBatch(db, huntId, "osm", 0, deps, 3)).rejects.toMatchObject({ status: 400 });
  });

  it("runs the registry sources city by city; the same registry rows never create two leads", async () => {
    const deps: SourceDeps = { overpass: fakeOverpass([]), socrata: createMockSocrata() };
    const { huntId } = await createHunt(db, { prompt: "x", criteria });
    const seen: number[] = [];
    let r = await runBatch(db, huntId, "rues", undefined, deps);
    seen.push(r.city);
    let guard = 0;
    while (!r.done && guard++ < 10) {
      r = await runBatch(db, huntId, "rues", r.nextCursor, deps, r.nextCity);
      seen.push(r.city);
    }
    expect(r.done).toBe(true);
    expect([...new Set(seen)]).toEqual([0, 1, 2]);
    const single = await createHunt(db, { prompt: "x", criteria: dental });
    const one = await runBatch(db, single.huntId, "rues", undefined, deps);
    const all = await db.select().from(leads).where(eq(leads.huntId, huntId));
    // the mock serves the same sample for every city: dedupe keeps one lead per company
    expect(all).toHaveLength(one.newLeads);
  });

  it("single-city hunts keep the old progress shape", () => {
    const p = initialSourcesProgress(dental);
    expect(p.osm.city).toBeUndefined();
    expect(p.osm.cities).toBeUndefined();
  });
});

/* ---------- scoring and benchmark ---------- */

describe("city criterion and benchmark", () => {
  const company = (cityName: string | null): ScoreCompany => ({ name: "Clinica Sonrisa SAS", city: cityName, website: null, nit: null, isLegalEntity: true, contacts: [], sources: [{ channel: "osm", url: "https://www.openstreetmap.org/node/1" }] });
  const crit = async (cityName: string | null, c: IcpCriteria) => (await scoreFit(company(cityName), c)).criteria.find((x) => x.criterio.startsWith("Ciudad"))!;

  it("'Ciudad' is met when the company is in ANY of the hunt cities", async () => {
    const multi = withCities(dental, [city("bogota"), city("medellin"), city("cali")]);
    expect(await crit("Medellín", multi)).toMatchObject({ cumplido: true, criterio: "Ciudad: Bogota, Medellin, Cali" });
    expect(await crit("Medellin Para Antioquia", multi)).toMatchObject({ cumplido: true });
    expect(await crit("Barranquilla", multi)).toMatchObject({ cumplido: false });
    expect(await crit(null, multi)).toMatchObject({ cumplido: false });
    // single city: as before
    expect(await crit("Bogota", dental)).toMatchObject({ cumplido: true, criterio: "Ciudad: Bogota" });
    expect(await crit("Cali", dental)).toMatchObject({ cumplido: false });
  });

  const peer = (cityName: string | null, booking = false): PeerSite => ({ onlineBooking: booking, whatsapp: false, form: false, copyrightYear: null, city: cityName });
  const you = siteFactsFrom([], []);

  it("compares against the lead's own city, or the whole hunt when that city has fewer than 5", () => {
    const peers = [...Array.from({ length: 6 }, (_, i) => peer("Bogota", i < 3)), peer("Cali", true), peer("Cali", true)];
    const bog = computeBenchmark(you, peers, { city: "Bogota", websiteKnown: true });
    expect(bog.scope).toBe("city");
    expect(bog.rows.find((r) => r.key === "booking")).toMatchObject({ n: 6, pct: 0.5 });
    const cali = computeBenchmark(you, peers, { city: "Cali", websiteKnown: true });
    expect(cali.scope).toBe("hunt");
    expect(cali.rows.find((r) => r.key === "booking")).toMatchObject({ n: 8, pct: 5 / 8 });
    expect(benchmarkPeers(peers, null).scope).toBe("hunt");
  });

  it("resolves a company's city in the hunt by name, coordinates or the only city", () => {
    const cities = [{ name: "Bogota", bbox: city("bogota").bbox }, { name: "Medellin", bbox: city("medellin").bbox }];
    expect(resolveHuntCity({ city: "MEDELLIN PARA ANTIOQUIA" }, cities)).toBe("Medellin");
    expect(resolveHuntCity({ city: null, lat: 4.6, lng: -74.1 }, cities)).toBe("Bogota");
    expect(resolveHuntCity({ city: null, lat: 0, lng: 0 }, cities)).toBeNull();
    expect(resolveHuntCity({ city: null }, [{ name: "Cali" }])).toBe("Cali");
  });
});
