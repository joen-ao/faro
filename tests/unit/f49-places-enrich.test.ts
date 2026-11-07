import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { companies, companySources } from "@/db/schema";
import { seedCostRates } from "@/db/seed";
import type { AppDb } from "@/db/types";
import { ownSiteRoot } from "@/features/enrichment/discover";
import { enrichFromPlaces, matchPlace } from "@/features/enrichment/places-match";
import { outreachEligibility } from "@/features/offer/fit";
import type { PlacesAdapter, PlacesCriteria } from "@/integrations/google-places";
import { toSourceCompany } from "@/integrations/google-places";
import type { RawPlace } from "@/integrations/google-places";
import { createTestDb } from "../helpers/test-db";

const place = (id: string, name: string, address: string, websiteUri?: string): RawPlace => ({ id, displayName: { text: name }, formattedAddress: address, websiteUri, types: ["dentist"], businessStatus: "OPERATIONAL" });
const sc = (p: RawPlace) => toSourceCompany(p)!;

/** A "real" adapter double: returns fixed places and counts calls. */
function fakePlaces(places: RawPlace[]): PlacesAdapter & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    async search(c: PlacesCriteria) {
      queries.push(c.businessType ?? "");
      return { companies: places.map(sc), calls: 1, latencyMs: 1, isMock: false };
    },
  };
}

describe("F49 · matching a place to a company", () => {
  it("needs the distinctive word in the place name and the city in the address", () => {
    const co = { name: "CLINICA ODONTOLOGICA SONRISA SAS", city: "Bogotá" };
    expect(matchPlace(co, [sc(place("A", "Sonrisas Medellín", "Cl 10, Medellín")), sc(place("B", "Clínica Sonrisa", "Cra 7 # 45-10, Bogotá, Colombia"))])?.name).toBe("Clínica Sonrisa");
    expect(matchPlace(co, [sc(place("A", "Clínica Sonrisa", "Cl 10, Medellín"))])).toBeNull();
    expect(matchPlace({ name: "CLINICA DENTAL SAS", city: "Bogotá" }, [sc(place("A", "Clínica Dental", "Bogotá"))])).toBeNull();
  });
  it("only keeps a company's own site", () => {
    expect(ownSiteRoot("https://www.sonrisa.com.co/inicio")).toBe("https://sonrisa.com.co");
    expect(ownSiteRoot("https://instagram.com/sonrisa")).toBeNull();
  });
});

describe("F49 · enrichFromPlaces", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let db: AppDb;
  let n = 0;
  const mkCompany = async (name: string, website: string | null = null) => {
    n++;
    const [c] = await db.insert(companies).values({ name, normalizedName: `${name.toLowerCase()} ${n}`, city: "Bogotá", website }).returning();
    return c!.id;
  };
  const sourcesOf = (id: string) => db.select().from(companySources).where(and(eq(companySources.companyId, id), eq(companySources.sourceChannel, "google_places")));
  const elig = async (id: string) => {
    const [c] = await db.select().from(companies).where(eq(companies.id, id));
    const sources = (await sourcesOf(id)).map((s) => ({ sourceChannel: s.sourceChannel, sourceUrl: s.sourceUrl, license: s.license, isMock: s.isMock, raw: s.raw }));
    return outreachEligibility({ sector: "Clínicas odontológicas", company: { ...c!, isLegalEntity: true }, sources, contacts: [{ type: "email", sourceChannel: "rues", isGeneric: true }] });
  };

  beforeAll(async () => {
    conn = await createTestDb();
    db = conn.db as unknown as AppDb;
    await seedCostRates(db as never);
  }, 60_000);
  afterAll(async () => {
    await conn.close();
  });

  it("matched without website → 'no tiene web' becomes a verified finding", async () => {
    const id = await mkCompany("CLINICA ODONTOLOGICA SONRISA SAS");
    expect(await elig(id)).toEqual({ ok: false, reason: "sin_web_no_verificada" });
    const r = await enrichFromPlaces(db, id, fakePlaces([place("P1", "Clínica Sonrisa", "Cra 7, Bogotá")]));
    expect(r).toMatchObject({ status: "matched", placeId: "P1", websiteFound: null, calls: 1 });
    expect(await elig(id)).toMatchObject({ ok: true, finding: "no-website" });
  });

  it("no match is stored as a miss and proves nothing; never searched twice", async () => {
    const id = await mkCompany("ODONTOLOGIA BRILLANTE SAS");
    const places = fakePlaces([place("P2", "Otra Clínica", "Bogotá")]);
    expect((await enrichFromPlaces(db, id, places)).status).toBe("no_match");
    expect((await sourcesOf(id))[0]!.externalId).toBe(`places-miss:${id}`);
    expect(await elig(id)).toEqual({ ok: false, reason: "sin_web_no_verificada" });
    expect((await enrichFromPlaces(db, id, places)).status).toBe("already_checked");
    expect(places.queries).toHaveLength(1);
  });

  it("an own website is saved on the company; Instagram is not", async () => {
    const a = await mkCompany("DENTALIA PREMIUM SAS");
    await enrichFromPlaces(db, a, fakePlaces([place("P3", "Dentalia Premium", "Bogotá", "https://www.dentaliapremium.co/")]));
    expect((await db.select().from(companies).where(eq(companies.id, a)))[0]!.website).toBe("https://dentaliapremium.co");
    const b = await mkCompany("ORTODONCIA ALEGRE SAS");
    const r = await enrichFromPlaces(db, b, fakePlaces([place("P4", "Ortodoncia Alegre", "Bogotá", "https://instagram.com/alegre")]));
    expect(r.websiteFound).toBeNull();
    expect((await db.select().from(companies).where(eq(companies.id, b)))[0]!.website).toBeNull();
  });
});

describe("F49 · who is worth a search", () => {
  it("normalises registry cities and skips employee funds and cooperatives", async () => {
    const { cityKey } = await import("@/features/enrichment/places-match");
    expect(cityKey("Medellin Para Antioquia")).toBe("medellin");
    expect(cityKey("Bogota, D.C")).toBe("bogota");
    expect(matchPlace({ name: "ORALIMAGEN S.A.S.", city: "Medellin Para Antioquia" }, [sc(place("Z", "Oralimagen", "Cl 10 #20, Medellín, Antioquia"))])?.name).toBe("Oralimagen");
    const base = { sector: "Clínicas odontológicas", sources: [], contacts: [{ type: "email", sourceChannel: "rues", isGeneric: true }] };
    expect(outreachEligibility({ ...base, company: { name: "Fondo De Empleados Del Sector Salud", address: null, city: null, website: null, isLegalEntity: true } })).toEqual({ ok: false, reason: "tipo_no_objetivo" });
  });
});
