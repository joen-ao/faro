import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSocrata } from "@/integrations/socrata";
import { looksLikePersonalName, parseReps, parseRues, repsWhere, ruesWhere, soql } from "@/integrations/socrata/datasets";
import { buildSocrataUrl, createRealSocrata } from "@/integrations/socrata/real";
import { parseEnv } from "@/lib/env";

const rues = JSON.parse(readFileSync("fixtures/socrata-rues-sample.json", "utf8")).rows;
const reps = JSON.parse(readFileSync("fixtures/socrata-reps-sample.json", "utf8")).rows;

describe("socrata", () => {
  it("escapes SoQL literals", () => {
    expect(soql("O'Brien")).toBe("'O''Brien'");
  });

  it("builds SoQL URLs", () => {
    const u = new URL(buildSocrataUrl("c82u-588k", { select: "count(*)", where: "a='b'", limit: 1 }));
    expect(u.pathname).toBe("/resource/c82u-588k.json");
    expect(u.searchParams.get("$select")).toBe("count(*)");
    expect(u.searchParams.get("$where")).toBe("a='b'");
    expect(u.searchParams.get("$limit")).toBe("1");
  });

  it("RUES filter excludes persona natural and inactive registrations", () => {
    const w = ruesWhere({ ciiu: "8622", camara: "BOGOTA" });
    expect(w).toContain("cod_ciiu_act_econ_pri='8622'");
    expect(w).toContain("camara_comercio='BOGOTA'");
    expect(w).toContain("estado_matricula='ACTIVA'");
    expect(w).toContain("organizacion_juridica!='PERSONA NATURAL'");
  });

  it("REPS filter keeps NIT IPS and dental keywords only", () => {
    const w = repsWhere({ municipio: "BOGOT", nameKeywords: ["ODONT"] });
    expect(w).toContain("tipoid='NI'");
    expect(w).toContain("claseprestador like 'Instituciones Prestadoras%'");
    expect(w).toContain("upper(nombresede) like '%ODONT%'");
  });

  it("parses RUES/REPS fixtures without personal fields", () => {
    const c = parseRues(rues);
    expect(c.length).toBeGreaterThan(5);
    expect(c.every((x) => x.isLegalEntity && x.razonSocial)).toBe(true);
    expect(Object.keys(c[0])).not.toContain("representanteLegal");
    const p = parseReps(reps);
    expect(p.length).toBeGreaterThan(5);
    expect(p.every((x) => x.isLegalEntity && x.nit)).toBe(true);
  });

  it("flags natural persons and independent professionals as not legal", () => {
    expect(parseRues([{ razon_social: "X", organizacion_juridica: "PERSONA NATURAL" }])[0].isLegalEntity).toBe(false);
    expect(parseReps([{ nombresede: "Y", tipoid: "CC", claseprestador: "Profesional Independiente" }])[0].isLegalEntity).toBe(false);
  });

  it("real adapter pages through results and counts (fake fetch)", async () => {
    const fetchImpl = (async (url: string) => {
      const u = new URL(url);
      if (u.searchParams.get("$select") === "count(*)") return new Response(JSON.stringify([{ count: "3" }]), { status: 200 });
      const off = Number(u.searchParams.get("$offset") ?? 0);
      const rows = off === 0 ? [{ a: "1" }, { a: "2" }] : [{ a: "3" }];
      return new Response(JSON.stringify(rows), { status: 200 });
    }) as unknown as typeof fetch;
    const s = createRealSocrata({ fetchImpl, sleep: async () => {}, minIntervalMs: 0 });
    expect((await s.count("x", "a=1")).count).toBe(3);
    expect((await s.queryAll("x", {}, { pageSize: 2 })).rows).toHaveLength(3);
  });

  it("mock mode serves flagged fixtures", async () => {
    const r = await getSocrata(parseEnv({ SOCRATA_MODE: "mock" })).query("c36g-9fc2", {});
    expect(r.isMock).toBe(true);
    expect(r.rows.length).toBeGreaterThan(0);
  });
});

describe("personal-name heuristic", () => {
  it("flags E.U. with person-like names, not business names", () => {
    expect(looksLikePersonalName("NOMBRE APELLIDO PRUEBA E U - EN LIQUIDACION")).toBe(true);
    expect(looksLikePersonalName("NOMBRE PRUEBA EMPRESA UNIPERSONAL")).toBe(true);
    expect(looksLikePersonalName("SERVICIOS ODONTOLOGICOS DEL NORTE E.U.")).toBe(false);
    expect(looksLikePersonalName("NOMBRE APELLIDO PRUEBA LTDA")).toBe(false);
  });
  it("marks parsed rows", () => {
    expect(parseRues([{ razon_social: "NOMBRE APELLIDO PRUEBA E U", organizacion_juridica: "EMPRESAS UNIPERSONALES" }])[0].possibleNaturalPerson).toBe(true);
  });
});
