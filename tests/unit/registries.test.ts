import { describe, expect, it } from "vitest";
import { planSources, initialSourcesProgress } from "@/features/hunts/batch";
import { isTourismSector, sectorNameKeywords } from "@/features/hunts/keywords";
import { companyNit, normalizeWebsite, registryToSource, registryWhere } from "@/integrations/socrata/registries";
import { isPersonalRow } from "@/integrations/socrata/datasets";
import { scoreFit } from "@/features/scoring/fit";
import type { IcpCriteria } from "@/features/icp/schema";

const icp = (over: Partial<IcpCriteria> = {}): IcpCriteria =>
  ({
    sector: "Contabilidad y asesoría tributaria",
    ciiu: ["6920"],
    osmTags: ["office=accountant"],
    placesTypes: [],
    city: "Bogota",
    country: "CO",
    bbox: [4.45, -74.25, 4.84, -73.99],
    signals: [],
    exclusions: [],
    language: "es",
    ...over,
  }) as IcpCriteria;

describe("sector keywords", () => {
  it("uses verified words for presets and the first letters of long words otherwise", () => {
    expect(sectorNameKeywords({ sector: "Clínicas odontológicas" })).toContain("ODONT");
    expect(sectorNameKeywords({ sector: "Contabilidad y asesoría tributaria" })).toEqual(["CONTA", "TRIBU"]);
    expect(sectorNameKeywords({ sector: "Servicios jurídicos / Abogados" })).toEqual(["JURID", "ABOGA"]);
  });
  it("only treats tourism sectors as RNT material", () => {
    expect(isTourismSector("Hoteles boutique")).toBe(true);
    expect(isTourismSector("Agencias de viajes")).toBe(true);
    expect(isTourismSector("Clínicas dentales")).toBe(false);
  });
});

describe("source plan", () => {
  it("adds SECOP II and Supersolidaria in Colombia, RNT only for tourism", () => {
    const p = planSources(icp());
    expect(p.secop.applicable).toBe(true);
    expect(p.solidaria.applicable).toBe(true);
    expect(p.rnt).toEqual({ applicable: false, reason: "RNT solo cubre turismo" });
    expect(planSources(icp({ sector: "Hoteles", ciiu: ["5511"] })).rnt.applicable).toBe(true);
    expect(planSources(icp({ country: "US", city: "Miami" })).secop.applicable).toBe(false);
    expect(Object.keys(initialSourcesProgress(icp()))).toEqual(["osm", "rues", "reps", "secop", "rnt", "solidaria"]);
  });
});

describe("registry where clauses", () => {
  it("filters by DANE code, active companies and sector words, escaping input", () => {
    const w = registryWhere("secop", { city: "Bogota", dane: "11001", keywords: ["CONTA", "O'NEIL"] });
    expect(w).toContain("ubicacion like '%-11001'");
    expect(w).toContain("tipo_empresa not like 'PERSONA NATURAL%'");
    expect(w).toContain("upper(nombre) like 'CONTA%'");
    expect(w).toContain("upper(nombre) like '% CONTA%'");
    expect(w).not.toContain("'%CONTA%'");
    expect(w).toContain("'O NEIL%'");
    expect(registryWhere("rnt", { city: "Bogota", dane: "11001", keywords: ["HOTEL"] })).toContain("cod_mun='11001'");
    expect(registryWhere("solidaria", { city: "Bogotá", keywords: ["CONTA"] })).toContain("upper(municipio) like 'B_G_T_%'");
    expect(() => registryWhere("secop", { city: "Bogota", dane: "1100'1", keywords: ["X"] })).toThrow();
    expect(() => registryWhere("secop", { city: "Bogota", keywords: [] })).toThrow();
  });
});

describe("registry rows", () => {
  it("keeps company NITs only and generic company mailboxes only", () => {
    expect(companyNit("901622482")).toBe("901622482");
    expect(companyNit("79331879")).toBeUndefined();
    expect(companyNit("890-911-402-6", true)).toBe("890911402");
    const { companies, excluded } = registryToSource(
      "secop",
      [
        { nombre: "CONTABLEX SAS", nit: "900703490", correo: "INFO@CONTABLEX.COM.CO", sitio_web: "HTTPS://WWW.CONTABLEX.COM.CO/", telefono: "3133760633", descripcion_categoria_principal: "No Definido" },
        { nombre: "360 CONTABLE SAS", nit: "901622482", correo: "NABRIL@360CONTABLE.COM", sitio_web: "No Provisto" },
        { nombre: "CENTRAL CONTABLE", nit: "79331879", correo: "INFO@X.COM" },
      ],
      { city: "Bogota", keywords: ["CONTA"] },
      false,
    );
    expect(excluded).toBe(1);
    expect(companies).toHaveLength(2);
    expect(companies[0]).toMatchObject({ name: "Contablex Sas", nit: "900703490", email: "info@contablex.com.co", website: "https://contablex.com.co", city: "Bogota", sourceChannel: "secop", externalId: "secop:900703490" });
    expect(companies[0]!.raw.sector_match).toContain("CONTA");
    expect(companies[1]!.email).toBeUndefined();
    // A sector word inside another word is not evidence.
    const d = registryToSource("secop", [{ nombre: "DISTRIBUIDORA ANDINA SAS", nit: "900111222" }], { city: "Bogota", keywords: ["TRIBU"] }, false);
    expect(d.companies[0]!.raw.sector_match).toBeUndefined();
    expect(normalizeWebsite("No Provisto")).toBeUndefined();
    expect(normalizeWebsite("WWW.VCFAUDITORES.COM")).toBe("https://vcfauditores.com");
  });
  it("redacts natural-person registry rows before caching", () => {
    expect(isPersonalRow({ nombre: "JUAN PEREZ", nit: "79331879" })).toBe(true);
    expect(isPersonalRow({ nombre: "CONTABLEX SAS", nit: "900703490", tipo_empresa: "SOCIEDAD POR ACCIONES SIMPLIFICADA" })).toBe(false);
    expect(isPersonalRow({ entidad: "COOPERATIVA X", nit: "890-911-402-6" })).toBe(false);
  });
});

describe("scoring with a registry source", () => {
  it("counts SECOP II as legal registry and its sector word as sector evidence", async () => {
    const r = await scoreFit(
      {
        name: "Contablex SAS",
        city: "Bogota",
        website: "https://contablex.com.co",
        nit: "900703490",
        isLegalEntity: true,
        contacts: [{ type: "email", value: "info@contablex.com.co", isGeneric: true, evidenceUrl: "https://www.datos.gov.co/resource/qmzu-gj57" }],
        sources: [{ channel: "secop", url: "https://www.datos.gov.co/resource/qmzu-gj57", sectorMatch: "SECOP II: el registro contiene «CONTA»" }],
        websiteText: null,
      },
      icp(),
    );
    const byName = Object.fromEntries(r.criteria.map((c) => [c.criterio.split(" (")[0]!.split(":")[0], c]));
    expect(byName["Persona juridica verificada"]!.cumplido).toBe(true);
    expect(byName["Persona juridica verificada"]!.evidencia).toContain("SECOP II");
    expect(byName["Sector coincide"]!.cumplido).toBe(true);
    expect(r.meetsThreshold).toBe(true);
  });
});

describe("a hunt reading SECOP II end to end", () => {
  it("stores registry companies with their generic email and promotes them to the profile", async () => {
    const { createTestDb } = await import("../helpers/test-db");
    const { createHunt, runBatch } = await import("@/features/hunts/service");
    const { leads, contactPoints, companySources } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const conn = await createTestDb();
    const db = conn.db as unknown as import("@/db/types").AppDb;
    try {
      const rows = [
        // No website: generic email + registry NIT + sector word + city must be enough for the profile.
        { nombre: "CONTABLEX SAS", nit: "900703490", correo: "INFO@CONTABLEX.COM.CO", telefono: "6013133760" },
        { nombre: "JUAN PEREZ CONTADOR", nit: "79331879", correo: "INFO@JP.COM" },
      ];
      const socrata = {
        async query() {
          return { rows, latencyMs: 1, fromCache: false, isMock: false };
        },
        async count() {
          return { count: rows.length, latencyMs: 1 };
        },
        async queryAll() {
          return { rows, latencyMs: 1, fromCache: false, isMock: false };
        },
      };
      const overpass = { async search() { return { places: [], companies: [], latencyMs: 1, endpoint: "fake", fromCache: false, isMock: false }; } };
      const { huntId, sources } = await createHunt(db, { prompt: "Firmas contables en Bogotá", criteria: icp() });
      expect(sources.secop.state).toBe("pending");
      const r = await runBatch(db, huntId, "secop", undefined, { socrata, overpass } as never);
      expect(r).toMatchObject({ done: true, newLeads: 1 });
      const [lead] = await db.select().from(leads).where(eq(leads.huntId, huntId));
      expect(lead!.primarySource).toBe("secop");
      expect(lead!.status).toBe("fit");
      const cps = await db.select().from(contactPoints).where(eq(contactPoints.companyId, lead!.companyId));
      expect(cps.find((c) => c.type === "email")).toMatchObject({ value: "info@contablex.com.co", isGeneric: true });
      const src = await db.select().from(companySources).where(eq(companySources.companyId, lead!.companyId));
      expect(src[0]!.sourceChannel).toBe("secop");
    } finally {
      await conn.close();
    }
  }, 60_000);
});

describe("sector words from the model", () => {
  it("uses Claude's name keywords first, cleaned, without generic words", () => {
    const k = sectorNameKeywords({ sector: "Bioimpresión 3D", nameKeywords: ["Bioimpresión", "impresión 3D", "SERVICIOS", "3D", "biotec"] });
    expect(k).toEqual(["BIOIMPRESION", "IMPRESION 3D", "3D", "BIOTEC", "BIOIM"]);
    expect(sectorNameKeywords({ sector: "Bioimpresión 3D" })).toEqual(["BIOIM"]);
  });
});

describe("registry evidence reaches the hunt scoring", () => {
  it("matches multi-word sector phrases", () => {
    const d = registryToSource("secop", [{ nombre: "MANUFACTURA ADITIVA IP 3D SAS", nit: "900111333" }], { city: "Bogota", keywords: ["IMPRESION 3D", "MANUFACTURA ADITIVA"] }, false);
    expect(d.companies[0]!.raw.sector_match).toContain("MANUFACTURA ADITIVA");
  });
});
