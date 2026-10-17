import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companies, companySources, contactPoints, hunts, icpProfiles, workspaces } from "@/db/schema";
import { dedupeAndPersist, getHuntDuplicates } from "@/features/dedupe/dedupe";
import { GridIndex, normalizeNit, type Entity } from "@/features/dedupe/match";
import { domainOf, haversineMeters, normalizeName, normalizePhoneE164, trigramSimilarity } from "@/features/dedupe/normalize";
import { planDedupe } from "@/features/dedupe/plan";
import { createMockOverpass } from "@/integrations/overpass/mock";
import { createMockSocrata } from "@/integrations/socrata/mock";
import { createSocrataSource } from "@/integrations/socrata/search";
import type { SourceCompany } from "@/integrations/types";
import { createTestDb } from "../helpers/test-db";

let n = 0;
function co(over: Partial<SourceCompany>): SourceCompany {
  n++;
  return {
    name: "X",
    externalId: `osm:node/${n}`,
    sourceChannel: "osm",
    sourceUrl: "https://example.org",
    license: "test",
    isLegalEntity: true,
    possibleNaturalPerson: false,
    raw: {},
    isMock: false,
    ...over,
  };
}
// ~111 m per 0.001 degree latitude
const LAT = 4.65;
const LNG = -74.05;
const dLat = (m: number) => m / 111_195;

describe("normalize helpers", () => {
  it("normalizes names: accents, legal suffixes, generic sector words", () => {
    expect(normalizeName("Clínica Dental Sonrisas SAS")).toBe("sonrisas");
    expect(normalizeName("SONRISAS CLINICA DENTAL S.A.S")).toBe("sonrisas");
    expect(normalizeName("Odontología Integral LTDA.")).toBe("integral");
    expect(normalizeName("Restaurante El Fogón E.U.")).toBe("fogon");
    expect(normalizeName("Instituto de Estudios Científicos en Odontologia S A SIGLA IECO")).toContain("ieco");
    expect(normalizeName("Clínica Dental")).toBe("clinica dental"); // only generic words: keeps them rather than empty
    expect(normalizeName(undefined)).toBe("");
    expect(normalizeName("Clínica Dental SAS")).toBe("clinica dental"); // never empty: falls back to non-legal tokens
    expect(normalizeName("Clínica Foo", ["foo"])).toBe("clinica");
  });

  it("trigram similarity behaves like pg_trgm", () => {
    expect(trigramSimilarity("sonrisas", "sonrisas")).toBe(1);
    expect(trigramSimilarity("sonrisas", "sonrisa")).toBeGreaterThan(0.6);
    expect(trigramSimilarity("sonrisas", "odontoven")).toBeLessThan(0.2);
    expect(trigramSimilarity("", "a")).toBe(0);
    expect(trigramSimilarity("ab", "cd")).toBe(0);
  });

  it("haversine, phones and domains", () => {
    expect(Math.round(haversineMeters(4.6, -74.1, 4.6, -74.1))).toBe(0);
    expect(haversineMeters(4.6, -74.1, 4.601, -74.1)).toBeGreaterThan(100);
    expect(haversineMeters(4.6, -74.1, 4.601, -74.1)).toBeLessThan(120);
    expect(normalizePhoneE164("(601) 234 5678")).toBe("+576012345678");
    expect(normalizePhoneE164("310 123 4567")).toBe("+573101234567");
    expect(normalizePhoneE164("+1 305 555 0100")).toBe("+13055550100");
    expect(normalizePhoneE164("212-555-0100")).toBe("+12125550100");
    expect(normalizePhoneE164("123")).toBeUndefined();
    expect(normalizePhoneE164(undefined)).toBeUndefined();
    expect(domainOf("https://www.Odontoven.com/inicio")).toBe("odontoven.com");
    expect(domainOf("odontoven.com")).toBe("odontoven.com");
    expect(domainOf("https://www.facebook.com/clinica")).toBeUndefined();
    expect(domainOf("https://clinica.wixsite.com/x")).toBeUndefined();
    expect(domainOf("https://linktr.ee/x")).toBeUndefined();
    expect(domainOf("wa.me/573001112233")).toBeUndefined();
    expect(domainOf("https://sites.google.com/view/x")).toBeUndefined();
    expect(domainOf("not a url")).toBeUndefined();
    expect(domainOf("")).toBeUndefined();
    expect(normalizeNit("830.001.007-1")).toBe("830001007");
    expect(normalizeNit("12")).toBeUndefined();
  });
});

describe("matching rules (planDedupe)", () => {
  it("merges the same NIT across RUES and REPS", () => {
    const plan = planDedupe([], [
      co({ name: "UNIDAD MEDICA Y DE DIAGNOSTICO S.A", nit: "830001007", sourceChannel: "reps", externalId: "reps:1100104035" }),
      co({ name: "Unidad Médica y de Diagnóstico SA", nit: "830.001.007", sourceChannel: "rues", externalId: "rues:830001007" }),
    ]);
    expect(plan.created).toHaveLength(1);
    expect(plan.pairs).toHaveLength(1);
    expect(plan.pairs[0].reason).toBe("nit");
    expect(plan.assignments).toHaveLength(2);
  });

  it("merges 'Clínica Dental Sonrisas SAS' with 'SONRISAS CLINICA DENTAL S.A.S' at 40 m", () => {
    const plan = planDedupe([], [
      co({ name: "Clínica Dental Sonrisas SAS", lat: LAT, lng: LNG }),
      co({ name: "SONRISAS CLINICA DENTAL S.A.S", lat: LAT + dLat(40), lng: LNG }),
    ]);
    expect(plan.created).toHaveLength(1);
    expect(plan.pairs[0].reason).toBe("name+distance");
    expect(plan.pairs[0].distanceMeters).toBeGreaterThan(30);
    expect(plan.pairs[0].distanceMeters).toBeLessThanOrEqual(80);
    expect(plan.pairs[0].similarity).toBeGreaterThanOrEqual(0.6);
  });

  it("does NOT merge the same name 2 km apart", () => {
    const plan = planDedupe([], [
      co({ name: "Clínica Dental Sonrisas SAS", lat: LAT, lng: LNG }),
      co({ name: "SONRISAS CLINICA DENTAL S.A.S", lat: LAT + dLat(2000), lng: LNG }),
    ]);
    expect(plan.created).toHaveLength(2);
    expect(plan.pairs).toHaveLength(0);
  });

  it("does NOT merge at 120 m, and does not merge different names at 10 m", () => {
    const far = planDedupe([], [co({ name: "Sonrisas", lat: LAT, lng: LNG }), co({ name: "Sonrisas", lat: LAT + dLat(120), lng: LNG })]);
    expect(far.pairs).toHaveLength(0);
    const different = planDedupe([], [co({ name: "Odontoven", lat: LAT, lng: LNG }), co({ name: "Dentalia", lat: LAT + dLat(10), lng: LNG })]);
    expect(different.pairs).toHaveLength(0);
  });

  it("franchise: same name, different sede stays separate unless same phone or domain", () => {
    const base = { name: "Dentalia Colombia" };
    const sedes = planDedupe([], [
      co({ ...base, lat: LAT, lng: LNG, phone: "+576011111111", website: "https://dentalia.co" }),
      co({ ...base, lat: LAT + dLat(5000), lng: LNG + 0.05, phone: "+576012222222" }),
      co({ ...base, lat: LAT - dLat(8000), lng: LNG - 0.05 }),
    ]);
    expect(sedes.created).toHaveLength(3);

    const samePhone = planDedupe([], [
      co({ ...base, lat: LAT, lng: LNG, phone: "601 111 1111" }),
      co({ ...base, lat: LAT + dLat(5000), lng: LNG, phone: "+57 601 111 1111" }),
    ]);
    expect(samePhone.pairs.map((p) => p.reason)).toEqual(["name+phone"]);

    const sameDomain = planDedupe([], [
      co({ ...base, lat: LAT, lng: LNG, website: "https://www.dentalia.co/sedes" }),
      co({ ...base, lat: LAT + dLat(5000), lng: LNG, website: "dentalia.co" }),
    ]);
    expect(sameDomain.pairs.map((p) => p.reason)).toEqual(["name+domain"]);
  });

  it("a shared platform domain (facebook.com) does not count", () => {
    const plan = planDedupe([], [
      co({ name: "Sonrisas", lat: LAT, lng: LNG, website: "https://facebook.com/sonrisas.bogota" }),
      co({ name: "Sonrisas", lat: LAT + dLat(5000), lng: LNG, website: "https://www.facebook.com/otra" }),
    ]);
    expect(plan.created).toHaveLength(2);
  });

  it("missing coords need domain/phone to merge; generic-only names still need proximity", () => {
    expect(planDedupe([], [co({ name: "Clínica Dental", lat: LAT, lng: LNG }), co({ name: "Clínica Dental", lat: LAT + dLat(3000), lng: LNG })]).created).toHaveLength(2);
    expect(planDedupe([], [co({ name: "Odontoven" }), co({ name: "Odontoven" })]).created).toHaveLength(2);
  });

  it("never merges companies whose NITs differ, whatever the name, distance, domain or phone", () => {
    const plan = planDedupe([], [
      co({ name: "Sonrisas", nit: "900111222", lat: LAT, lng: LNG, website: "https://sonrisas.co", phone: "+576015550101" }),
      co({ name: "Sonrisas", nit: "900333444", lat: LAT, lng: LNG, website: "https://sonrisas.co", phone: "+576015550101" }),
    ]);
    expect(plan.created).toHaveLength(2);
    expect(plan.pairs).toHaveLength(0);
  });

  it("NIT check digit is ignored; generic-only names need phone or domain, not distance", () => {
    expect(normalizeNit("900123456-7")).toBe("900123456");
    const dv = planDedupe([], [co({ name: "A Uno", nit: "900123456-7" }), co({ name: "A Uno SAS", nit: "900.123.456" })]);
    expect(dv.pairs.map((p) => p.reason)).toEqual(["nit"]);
    const near = planDedupe([], [co({ name: "Clínica Dental", lat: LAT, lng: LNG }), co({ name: "Clínica Dental", lat: LAT, lng: LNG })]);
    expect(near.created).toHaveLength(2);
    const phone = planDedupe([], [co({ name: "Clínica Dental", phone: "+576015550101" }), co({ name: "Clínica Dental", phone: "601 555 0101" })]);
    expect(phone.pairs.map((p) => p.reason)).toEqual(["name+phone"]);
  });

  it("does not mix demo and real records", () => {
    const plan = planDedupe([], [co({ name: "Sonrisas", lat: LAT, lng: LNG, isMock: true }), co({ name: "Sonrisas", lat: LAT, lng: LNG, isMock: false })]);
    expect(plan.created).toHaveLength(2);
  });

  it("completes empty fields and lets official sources drive name/address", () => {
    const plan = planDedupe([], [
      co({ name: "odontoven", lat: LAT, lng: LNG, website: "https://odontoven.com", phone: "+576013334444", address: "Calle 8 Sur" }),
      co({ name: "ODONTOVEN S.A.S.", nit: "900111222", sourceChannel: "rues", externalId: "rues:900111222", address: "Cl 8 Sur 38A-41", lat: LAT + dLat(30), lng: LNG }),
    ]);
    expect(plan.created).toHaveLength(1);
    const e = plan.created[0];
    expect(e.name).toBe("ODONTOVEN S.A.S.");
    expect(e.address).toBe("Cl 8 Sur 38A-41");
    expect(e.nit).toBe("900111222");
    expect(e.website).toBe("https://odontoven.com");
    expect(e.lat).toBe(LAT);
    expect(e.phones.has("+576013334444")).toBe(true);
  });

  it("OSM does not override an official name", () => {
    const plan = planDedupe([], [
      co({ name: "ODONTOVEN S.A.S.", nit: "900111222", sourceChannel: "rues", externalId: "rues:900111222" }),
      co({ name: "Odontoven", nit: "900111222", website: "https://odontoven.com", lat: LAT, lng: LNG }),
    ]);
    expect(plan.created[0].name).toBe("ODONTOVEN S.A.S.");
    expect(plan.created[0].lat).toBe(LAT);
  });

  it("skips already stored sources and registers existing entities", () => {
    const existing: Entity = {
      id: "e1", isNew: false, dirty: false, isDemo: false, name: "Sonrisas", normalizedName: "sonrisas", lat: LAT, lng: LNG,
      isLegalEntity: true, priority: 1, domains: new Set(), phones: new Set(),
    };
    const dup = co({ name: "Sonrisas SAS", lat: LAT, lng: LNG, externalId: "osm:node/999" });
    const plan = planDedupe([existing], [dup, co({ name: "Otro", externalId: "osm:node/998" })], new Set(["osm:osm:node/998"]));
    expect(plan.created).toHaveLength(0);
    expect(plan.pairs[0].keptCompanyId).toBe("e1");
    expect(plan.assignments).toHaveLength(1);
  });

  it("grid index finds neighbours across cell borders", () => {
    const g = new GridIndex();
    const e = { id: "a", lat: 4.5, lng: -74.0 } as Entity;
    g.add(e);
    g.add({ id: "nocoords" } as Entity);
    expect(g.near(4.5 + dLat(60), -74.0)).toContain(e);
    expect(g.near(4.9, -74.0)).not.toContain(e);
  });
});

describe("real fixtures", () => {
  it("OSM + REPS + RUES fixtures dedupe without losing any source", async () => {
    const osm = (await createMockOverpass().search({ tags: [] })).companies;
    const socrata = createSocrataSource(createMockSocrata());
    const rues = (await socrata.searchRues({ ciiu: ["8622"], camara: "BOGOTA" })).companies;
    const reps = (await socrata.searchReps({ municipio: "BOGOTA", service: "dental" })).companies;
    const all = [...osm, ...rues, ...reps];
    const plan = planDedupe([], all);
    const distinctKeys = new Set(all.map((c) => `${c.sourceChannel}:${c.externalId}`));
    expect(plan.assignments).toHaveLength(distinctKeys.size);
    expect(plan.created.length + plan.pairs.length).toBe(distinctKeys.size);
  });
});

describe("performance", () => {
  it("plans 5,000 synthetic companies in under 2 s", () => {
    const items: SourceCompany[] = [];
    for (let i = 0; i < 5000; i++) {
      items.push(co({ name: `Clínica Dental Nombre${i % 2500} ${String.fromCharCode(97 + (i % 26))}`, lat: LAT + ((i * 37) % 997) * 0.0004, lng: LNG + ((i * 91) % 991) * 0.0004, phone: i % 7 === 0 ? `31${String(i).padStart(8, "0")}` : undefined }));
    }
    const t0 = performance.now();
    const plan = planDedupe([], items);
    const ms = performance.now() - t0;
    expect(plan.assignments).toHaveLength(5000);
    expect(ms).toBeLessThan(2000);
  });
});

describe("dedupeAndPersist (PGlite)", () => {
  const conn = { current: undefined as Awaited<ReturnType<typeof createTestDb>> | undefined };
  let huntId = "";
  beforeAll(async () => {
    conn.current = await createTestDb();
    const db = conn.current.db;
    const [ws] = await db.insert(workspaces).values({ name: "t" }).returning();
    const [icp] = await db.insert(icpProfiles).values({ workspaceId: ws.id, prompt: "p" }).returning();
    const [h] = await db.insert(hunts).values({ icpProfileId: icp.id }).returning();
    huntId = h.id;
  });
  afterAll(() => conn.current?.close());

  const batch = () => [
    co({ name: "Clínica Dental Sonrisas SAS", externalId: "osm:node/s1", lat: LAT, lng: LNG, website: "https://sonrisas.co", phone: "+576015550101", email: "info@sonrisas.co" }),
    co({ name: "SONRISAS CLINICA DENTAL S.A.S", externalId: "rues:900555111", sourceChannel: "rues", nit: "900555111", lat: LAT + dLat(40), lng: LNG, phone: "(601) 555 0101" }),
    co({ name: "Sonrisas Odontología", externalId: "reps:1100000001", sourceChannel: "reps", nit: "900555111", email: "citas@sonrisas.co" }),
    co({ name: "Otra Clínica Aparte", externalId: "osm:node/o1", lat: LAT + dLat(3000), lng: LNG }),
  ];

  it("merges, keeps every source, dedupes contact points and stores pairs", async () => {
    const db = conn.current!.db as never;
    const r = await dedupeAndPersist(db, huntId, batch());
    expect(r.inserted).toBe(2);
    expect(r.merged).toBe(2);
    expect(r.pairs.map((p) => p.reason).sort()).toEqual(["name+distance", "nit"]);

    const d = conn.current!.db;
    expect(await d.select().from(companies)).toHaveLength(2);
    const sources = await d.select().from(companySources);
    expect(sources.map((s) => s.externalId).sort()).toEqual(["osm:node/o1", "osm:node/s1", "reps:1100000001", "rues:900555111"]);
    const sonrisas = (await d.select().from(companies)).find((c) => c.nit === "900555111")!;
    expect(sonrisas.name).toBe("SONRISAS CLINICA DENTAL S.A.S"); // official source wins
    expect(sonrisas.website).toBe("https://sonrisas.co");
    expect(sonrisas.lat).toBe(LAT);
    const cps = await d.select().from(contactPoints).where(eq(contactPoints.companyId, sonrisas.id));
    expect(cps.filter((c) => c.type === "phone")).toHaveLength(1);
    expect(cps.filter((c) => c.type === "email").map((c) => c.value).sort()).toEqual(["citas@sonrisas.co", "info@sonrisas.co"]);

    const stored = await getHuntDuplicates(db, huntId);
    expect(stored.merged).toBe(2);
    expect(stored.pairs[0].mergedName).toBeTruthy();
  });

  it("is idempotent and keeps accumulated pairs", async () => {
    const db = conn.current!.db as never;
    const r = await dedupeAndPersist(db, huntId, batch());
    expect(r).toMatchObject({ inserted: 0, merged: 0 });
    expect(await conn.current!.db.select().from(companySources)).toHaveLength(4);
    expect((await getHuntDuplicates(db, huntId)).merged).toBe(2);
  });

  it("merges new records into companies stored earlier (cross-run)", async () => {
    const db = conn.current!.db as never;
    const r = await dedupeAndPersist(db, huntId, [co({ name: "Sonrisas Dental", externalId: "osm:node/late", lat: LAT + dLat(20), lng: LNG, website: "https://sonrisas.co/citas" })]);
    expect(r.inserted).toBe(0);
    expect(r.merged).toBe(1);
    expect(await conn.current!.db.select().from(companies)).toHaveLength(2);
    expect(await conn.current!.db.select().from(companySources)).toHaveLength(5);
  });

  it("updates kept company when a later official source completes it", async () => {
    const db = conn.current!.db as never;
    await dedupeAndPersist(db, huntId, [co({ name: "Otra Clínica Aparte SAS", externalId: "rues:800000001", sourceChannel: "rues", nit: "800000001", lat: LAT + dLat(3010), lng: LNG, address: "Cra 7 # 1-2" })]);
    const rows = await conn.current!.db.select().from(companies);
    const c = rows.find((r) => r.nit === "800000001")!;
    expect(c.name).toBe("Otra Clínica Aparte SAS");
    expect(c.address).toBe("Cra 7 # 1-2");
    expect(rows).toHaveLength(2);
  });

  it("unknown hunt: still persists, reports not found", async () => {
    const db = conn.current!.db as never;
    const r = await dedupeAndPersist(db, "00000000-0000-4000-8000-000000000000", [co({ name: "Solitaria", externalId: "osm:node/solo" })]);
    expect(r.inserted).toBe(1);
    expect((await getHuntDuplicates(db, "00000000-0000-4000-8000-000000000000")).found).toBe(false);
  });

  it("persists 5,000 companies in a reasonable time (batch inserts)", async () => {
    const db = conn.current!.db as never;
    const items = Array.from({ length: 5000 }, (_, i) => co({ name: `Empresa Sintetica ${i}`, externalId: `osm:node/perf${i}`, lat: LAT + (i % 70) * 0.01, lng: LNG + Math.floor(i / 70) * 0.01, isMock: true }));
    const t0 = performance.now();
    const r = await dedupeAndPersist(db, huntId, items);
    expect(r.inserted).toBe(5000);
    expect(performance.now() - t0).toBeLessThan(15000);
  }, 30000);
});
