import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, companySources } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { evaluateOutreach } from "@/features/compliance/evaluate";
import { dedupeAndPersist } from "@/features/dedupe/dedupe";
import { ICP_EXAMPLES } from "@/features/icp/presets";
import { scoreFit } from "@/features/scoring/fit";
import { repsToSource, repsWhere, ruesToSource, ruesWhere } from "@/integrations/socrata";
import { registryToSource, registryWhere } from "@/integrations/socrata/registries";
import { createTestDb } from "../helpers/test-db";

const dental = ICP_EXAMPLES[0].criteria;

describe("independents in the registries", () => {
  it("drops the natural-person filters only when the hunt includes independents", () => {
    expect(ruesWhere({ ciiu: "8622", camara: "BOGOTA" })).toContain("organizacion_juridica!='PERSONA NATURAL'");
    expect(ruesWhere({ ciiu: "8622", camara: "BOGOTA", includeNatural: true })).not.toContain("PERSONA NATURAL");
    expect(repsWhere({ municipio: "Bogota", municipioCode: "11001" })).toContain("tipoid='NI'");
    const r = repsWhere({ municipio: "Bogota", municipioCode: "11001", includeIndependents: true });
    expect(r).toContain("Profesional Independiente");
    expect(r).not.toContain("tipoid='NI'");
    expect(registryWhere("secop", { city: "Bogota", dane: "11001", keywords: ["ODONT"], includeNatural: true })).not.toContain("PERSONA NATURAL");
  });

  it("keeps natural persons as independents with their registered business contact", () => {
    const rues = ruesToSource([{ razon_social: "DANA LIZETH SORIANO BERMUDEZ", nit: "1032443166", organizacion_juridica: "PERSONA NATURAL", cod_ciiu_act_econ_pri: "8622", camara_comercio: "BOGOTA" }], false, { includeNatural: true });
    expect(rues.companies[0]).toMatchObject({ isLegalEntity: false, nit: "1032443166", raw: { independiente: "1" } });
    expect(ruesToSource([{ razon_social: "DANA LIZETH SORIANO BERMUDEZ", nit: "1032443166", organizacion_juridica: "PERSONA NATURAL" }], false).companies).toHaveLength(0);

    const reps = repsToSource([{ codigoprestador: "1100112345", nombresede: "CONSULTORIO ODONTOLOGICO DANA SORIANO", numeroidentificacion: "1032443166", tipoid: "CC", claseprestador: "Profesional Independiente", email_sede: "dana.soriano@gmail.com", t_lefonosede: "3105550101", municipiosededesc: "BOGOTÁ, D.C." }], false, { includeNatural: true });
    expect(reps.companies[0]).toMatchObject({ isLegalEntity: false, email: "dana.soriano@gmail.com", raw: { independiente: "1" } });

    const secop = registryToSource("secop", [{ nombre: "DANA SORIANO ODONTOLOGIA", nit: "1032443166", correo: "dana.soriano@gmail.com" }], { city: "Bogota", keywords: ["ODONT"], includeNatural: true }, false);
    expect(secop.companies[0]).toMatchObject({ isLegalEntity: false, nit: "1032443166", email: "dana.soriano@gmail.com" });
    expect(registryToSource("secop", [{ nombre: "DANA SORIANO ODONTOLOGIA", nit: "1032443166" }], { city: "Bogota", keywords: ["ODONT"] }, false).companies).toHaveLength(0);
  });

  it("scores an independent only when the hunt includes them, with its registered contact", async () => {
    const company = {
      name: "Consultorio Odontologico Dana Soriano",
      city: "Bogota",
      website: null,
      nit: "1032443166",
      isLegalEntity: false,
      contacts: [{ type: "email", value: "dana.soriano@gmail.com", isGeneric: false, evidenceUrl: "https://www.datos.gov.co/resource/c36g-9fc2" }],
      sources: [{ channel: "reps", url: "https://www.datos.gov.co/resource/c36g-9fc2" }],
      websiteText: null,
    };
    expect((await scoreFit(company, dental)).score).toBe(0);
    const r = await scoreFit(company, { ...dental, includeIndependents: true });
    expect(r.meetsThreshold).toBe(true);
    expect(r.criteria.find((c) => c.criterio.startsWith("Negocio registrado"))!.cumplido).toBe(true);
    expect(r.criteria.find((c) => c.criterio.startsWith("Contacto del negocio"))!.cumplido).toBe(true);
  });

  it("never sends automatically to an independent", () => {
    const e = evaluateOutreach({ isLegalEntity: false, country: "CO", suppressed: false, alreadyContacted: false } as never, { channel: "email", value: "dana.soriano@gmail.com" } as never, new Date("2026-10-21T15:00:00Z"));
    expect(e.allowed).toBe(false);
    expect(e.blocks.map((b) => b.rule)).toContain("natural_person");
  });
});

describe("independents are deduplicated across registries", () => {
  it("the same ID number in RUES and REPS is one company", async () => {
    const conn = await createTestDb();
    const db = conn.db as unknown as AppDb;
    try {
      const rues = ruesToSource([{ razon_social: "DANA LIZETH SORIANO BERMUDEZ", nit: "1032443166", organizacion_juridica: "PERSONA NATURAL", cod_ciiu_act_econ_pri: "8622", camara_comercio: "BOGOTA" }], false, { includeNatural: true }).companies;
      const reps = repsToSource([{ codigoprestador: "1100112345", nombresede: "CONSULTORIO ODONTOLOGICO DANA SORIANO", numeroidentificacion: "1032443166", tipoid: "CC", claseprestador: "Profesional Independiente", email_sede: "dana.soriano@gmail.com", municipiosededesc: "BOGOTÁ, D.C." }], false, { includeNatural: true }).companies;
      await dedupeAndPersist(db, "00000000-0000-4000-8000-000000000001", rues);
      const second = await dedupeAndPersist(db, "00000000-0000-4000-8000-000000000001", reps);
      expect(second.merged).toBe(1);
      const all = await db.select().from(companies).where(eq(companies.nit, "1032443166"));
      expect(all).toHaveLength(1);
      expect(all[0]!.isLegalEntity).toBe(false);
      const src = await db.select().from(companySources).where(eq(companySources.companyId, all[0]!.id));
      expect(src.map((s) => s.sourceChannel).sort()).toEqual(["reps", "rues"]);
    } finally {
      await conn.close();
    }
  });
});

describe("RUES records get their REPS contact by ID number (health hunts)", () => {
  it("queries REPS with the batch's NITs and IDs and adds the matching records", async () => {
    const { fetchBatch } = await import("@/features/hunts/sources");
    const queries: Array<{ dataset: string; where?: string }> = [];
    const socrata = {
      async query(dataset: string, q: { where?: string }) {
        queries.push({ dataset, where: q.where });
        if (dataset === "c82u-588k") {
          return { rows: [
            { razon_social: "SERVICIOS INTEGRALES SALUD ORAL SAS", nit: "900111222", organizacion_juridica: "SOCIEDAD POR ACCIONES SIMPLIFICADA", cod_ciiu_act_econ_pri: "8622", camara_comercio: "BOGOTA" },
            { razon_social: "DANA LIZETH SORIANO BERMUDEZ", nit: "1032443166", organizacion_juridica: "PERSONA NATURAL", cod_ciiu_act_econ_pri: "8622", camara_comercio: "BOGOTA" },
          ], latencyMs: 1, fromCache: false, isMock: false };
        }
        return { rows: [
          { codigoprestador: "1100100001", nombresede: "SERVICIOS INTEGRALES SALUD ORAL", numeroidentificacion: "900111222", tipoid: "NI", claseprestador: "Instituciones Prestadoras de Servicios de Salud - IPS", email_sede: "info@saludoral.co", municipiosededesc: "BOGOTÁ, D.C." },
          { codigoprestador: "1100100002", nombresede: "DANA SORIANO", numeroidentificacion: "1032443166", tipoid: "CC", claseprestador: "Profesional Independiente", email_sede: "dana@gmail.com", municipiosededesc: "BOGOTÁ, D.C." },
        ], latencyMs: 1, fromCache: false, isMock: false };
      },
      async count() { return { count: 2, latencyMs: 1 }; },
      async queryAll() { return { rows: [], latencyMs: 1, fromCache: false, isMock: false }; },
    };
    const b = await fetchBatch("h", "rues", { ...dental, includeIndependents: true }, 0, { socrata, overpass: {} as never });
    expect(queries[1]!.where).toBe("numeroidentificacion in ('900111222','1032443166')");
    expect(b.companies.filter((c) => c.sourceChannel === "reps").map((c) => c.email)).toEqual(["info@saludoral.co", "dana@gmail.com"]);
  });
});
