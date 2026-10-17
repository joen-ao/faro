import { describe, expect, it, vi } from "vitest";
import {
  REDACTED,
  assertCiiu,
  buildSocrataUrl,
  createMockSocrata,
  createRealSocrata,
  createSocrataSource,
  genericEmailOnly,
  getSocrataSource,
  isPersonalRow,
  redactRow,
  repsWhere,
  ruesToSource,
  ruesWhere,
  sanitizeText,
  soql,
  type ApiCallRecord,
  type SocrataRow,
} from "@/integrations/socrata";
import { parseEnv } from "@/lib/env";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const noSleep = async () => {};

describe("SoQL construction and injection safety", () => {
  it("escapes quotes and control characters", () => {
    expect(soql("a'b")).toBe("'a''b'");
    expect(soql("a\nb\u0000c")).toBe("'a b c'");
  });

  it("rejects non-4-digit CIIU (injection attempt)", () => {
    expect(() => assertCiiu("8622' OR '1'='1")).toThrow();
    expect(() => ruesWhere({ ciiu: ["8622", "1; DROP"], camara: "BOGOTA" })).toThrow();
    expect(() => ruesWhere({ ciiu: [], camara: "BOGOTA" })).toThrow();
  });

  it("neutralises hostile camara / municipio / keyword text", () => {
    const evil = "BOGOTA' OR 1=1 --; %_\\";
    const w = ruesWhere({ ciiu: "8622", camara: evil });
    expect(w).toContain("camara_comercio='BOGOTA OR 1 1 --'");
    expect(w).not.toMatch(/[%;\\]/);
    const r = repsWhere({ municipio: evil, nameKeywords: ["ODONT'); DROP", "%"] });
    expect(r.match(/'/g)!.length % 2).toBe(0);
    expect(r).not.toContain("DROP TABLE");
    expect(r).not.toContain(";");
    expect(r).toContain("like '%B_G_T_ _R 1 1 --%'");
  });

  it("REPS municipio matches accented values via wildcard vowels", () => {
    expect(repsWhere({ municipio: "Bogotá" })).toContain("like '%B_G_T_%'");
  });

  it("rejects text that is empty after sanitising", () => {
    expect(() => ruesWhere({ ciiu: "8622", camara: "'%;" })).toThrow();
    expect(() => repsWhere({ municipio: "%%" })).toThrow();
    expect(sanitizeText("  bogotá d.c.  ")).toBe("BOGOTÁ D.C.");
  });

  it("supports multiple CIIU codes", () => {
    expect(ruesWhere({ ciiu: ["8621", "8622"], camara: "BOGOTA" })).toContain("cod_ciiu_act_econ_pri in ('8621','8622')");
  });

  it("validates dataset id and column lists in URLs", () => {
    expect(() => buildSocrataUrl("../etc/passwd", {})).toThrow();
    expect(() => buildSocrataUrl("abcd-1234", { select: "a; drop" })).toThrow();
    expect(() => buildSocrataUrl("abcd-1234", { order: "a;b" })).toThrow();
    const u = new URL(buildSocrataUrl("abcd-1234", { limit: 9_999_999, offset: -5, order: ":id" }));
    expect(u.searchParams.get("$limit")).toBe("50000");
    expect(u.searchParams.get("$offset")).toBe("0");
    expect(u.searchParams.get("$order")).toBe(":id");
  });
});

describe("legal-entity filter (case table)", () => {
  const cases: Array<[string, SocrataRow, "kept" | "natural" | "lookalike"]> = [
    ["persona natural", { razon_social: "ANA PEREZ GOMEZ", organizacion_juridica: "PERSONA NATURAL", nit: "1" }, "natural"],
    ["E.U. with a personal name", { razon_social: "MARIA LOPEZ DIAZ E U", organizacion_juridica: "EMPRESAS UNIPERSONALES", nit: "2" }, "lookalike"],
    ["empresa unipersonal with a personal name", { razon_social: "JUAN CARLOS RIOS EMPRESA UNIPERSONAL", organizacion_juridica: "EMPRESAS UNIPERSONALES", nit: "3" }, "lookalike"],
    ["E.U. with business words", { razon_social: "SERVICIOS ODONTOLOGICOS DEL NORTE E.U.", organizacion_juridica: "EMPRESAS UNIPERSONALES", nit: "4" }, "kept"],
    ["LTDA", { razon_social: "ANA PEREZ GOMEZ LTDA", organizacion_juridica: "SOCIEDAD LIMITADA", nit: "5" }, "kept"],
    ["S.A.S.", { razon_social: "CLINICA SONRISA SAS", organizacion_juridica: "SOCIEDAD POR ACCIONES SIMPLIFICADA", nit: "6" }, "kept"],
    ["missing organizacion_juridica", { razon_social: "ALGO SAS", nit: "7" }, "natural"],
  ];
  for (const [label, row, expected] of cases) {
    it(label, () => {
      const r = ruesToSource([row], false);
      expect(r.companies.length).toBe(expected === "kept" ? 1 : 0);
      expect(r.excluded.naturalPerson).toBe(expected === "natural" ? 1 : 0);
      expect(r.excluded.lookalike).toBe(expected === "lookalike" ? 1 : 0);
    });
  }

  it("REPS: professional independent, non-NIT ids and lookalikes are excluded", async () => {
    const rows: SocrataRow[] = [
      { codigoprestador: "1", nombresede: "CLINICA DENTAL X SAS", tipoid: "NI", claseprestador: "Instituciones Prestadoras de Servicios de Salud - IPS", numeroidentificacion: "9" },
      { codigoprestador: "2", nombresede: "LUIS GARCIA ROJAS", tipoid: "CC", claseprestador: "Profesional Independiente" },
      { codigoprestador: "3", nombresede: "OTRO NOMBRE", tipoid: "CC", claseprestador: "Instituciones Prestadoras de Servicios de Salud - IPS" },
      { codigoprestador: "4", nombresede: "PEDRO PABLO MORA E U", tipoid: "NI", claseprestador: "Instituciones Prestadoras de Servicios de Salud - IPS" },
      { codigoprestador: "5", nombresede: "", nombreprestador: "  " },
    ];
    const src = createSocrataSource({
      query: async () => ({ rows, latencyMs: 1, fromCache: false, isMock: false }),
      count: async () => ({ count: rows.length, latencyMs: 1 }),
      queryAll: async () => ({ rows, latencyMs: 1, fromCache: false, isMock: false }),
    });
    const r = await src.searchReps({ municipio: "Bogotá", service: "dental" });
    expect(r.companies.map((c) => c.externalId)).toEqual(["reps:1"]);
    expect(r.excluded).toEqual({ naturalPerson: 2, lookalike: 1, noName: 1 });
    expect(r.totalRows).toBe(5);
  });
});

describe("normalisation", () => {
  it("builds SourceCompany from RUES with external_id, license and no personal data", () => {
    const r = ruesToSource(
      [{ razon_social: "CLINICA SONRISA SAS", nit: "900123456", cod_ciiu_act_econ_pri: "8622", organizacion_juridica: "SOCIEDAD POR ACCIONES SIMPLIFICADA", camara_comercio: "BOGOTA", representante_legal: "JUAN PEREZ" }],
      false,
    );
    const c = r.companies[0];
    expect(c.externalId).toBe("rues:900123456");
    expect(c.sourceChannel).toBe("rues");
    expect(c.license).toBe("CC BY-SA 4.0 · datos.gov.co");
    expect(c.city).toBe("Bogota");
    expect(c.isLegalEntity).toBe(true);
    expect(c.isMock).toBe(false);
    expect(JSON.stringify(c)).not.toContain("JUAN");
    expect(Object.keys(c.raw).sort()).toEqual(["camara_comercio", "ciiu", "organizacion_juridica"]);
  });

  it("dedupes repeated NIT and falls back to a stable id without NIT", () => {
    const row = { razon_social: "A SAS", nit: "1", organizacion_juridica: "SOCIEDAD LIMITADA" };
    expect(ruesToSource([row, row], false).companies).toHaveLength(1);
    const noNit = ruesToSource([{ razon_social: "A SAS", organizacion_juridica: "SOCIEDAD LIMITADA" }], false).companies[0];
    expect(noNit.externalId).toMatch(/^rues:n-/);
  });

  it("keeps only generic emails and unmasked phones for REPS", async () => {
    const rows: SocrataRow[] = [
      { codigoprestador: "10", nombresede: "IPS UNO SAS", tipoid: "NI", claseprestador: "Instituciones Prestadoras de Servicios de Salud - IPS", email_sede: "Citas@ipsuno.com", t_lefonosede: "6012345678", direcci_nsede: "Cra 1 # 2-3", municipiosededesc: "BOGOTA" },
      { codigoprestador: "11", nombresede: "IPS DOS SAS", tipoid: "NI", claseprestador: "Instituciones Prestadoras de Servicios de Salud - IPS", email_sede: "juan.perez@gmail.com", t_lefonosede: "000-0000000" },
    ];
    const mk = createSocrataSource({ query: vi.fn(), count: vi.fn(), queryAll: async () => ({ rows, latencyMs: 0, fromCache: false, isMock: false }) });
    const { companies } = await mk.searchReps({ municipio: "BOGOTA" });
    expect(companies[0]).toMatchObject({ externalId: "reps:10", email: "citas@ipsuno.com", phone: "6012345678", city: "Bogota", address: "Cra 1 # 2-3" });
    expect(companies[1].email).toBeUndefined();
    expect(companies[1].phone).toBeUndefined();
    expect(genericEmailOnly("info1@x.co")).toBe("info1@x.co");
    expect(genericEmailOnly("notanemail")).toBeUndefined();
    expect(genericEmailOnly("redacted@example.invalid")).toBeUndefined();
  });
});

describe("real adapter: pagination, token, logging, cache", () => {
  it("pages with $limit/$offset and stops on a short page", async () => {
    const calls: URL[] = [];
    const fetchImpl = (async (url: string) => {
      const u = new URL(url);
      calls.push(u);
      const off = Number(u.searchParams.get("$offset") ?? 0);
      return json(Array.from({ length: off >= 4 ? 1 : 2 }, (_, i) => ({ a: String(off + i) })));
    }) as unknown as typeof fetch;
    const s = createRealSocrata({ fetchImpl, sleep: noSleep, minIntervalMs: 0 });
    const r = await s.queryAll("abcd-1234", { where: "a=1" }, { pageSize: 2 });
    expect(r.rows).toHaveLength(5);
    expect(calls.map((u) => u.searchParams.get("$offset"))).toEqual([null, "2", "4"]);
    expect(calls.every((u) => u.searchParams.get("$limit") === "2" && u.searchParams.get("$order") === ":id")).toBe(true);
  });

  it("caps at maxRows without over-fetching", async () => {
    const fetchImpl = (async (url: string) => {
      const lim = Number(new URL(url).searchParams.get("$limit"));
      return json(Array.from({ length: lim }, () => ({ a: "x" })));
    }) as unknown as typeof fetch;
    const s = createRealSocrata({ fetchImpl, sleep: noSleep, minIntervalMs: 0 });
    expect((await s.queryAll("abcd-1234", {}, { pageSize: 3, maxRows: 5 })).rows).toHaveLength(5);
  });

  it("sends X-App-Token only when configured and logs each call", async () => {
    const seen: Array<Record<string, string>> = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      seen.push(init.headers as Record<string, string>);
      return json([{ count: "7" }]);
    }) as unknown as typeof fetch;
    const log: ApiCallRecord[] = [];
    const a = createRealSocrata({ fetchImpl, appToken: "tok", sleep: noSleep, minIntervalMs: 0, onCall: (c) => void log.push(c) });
    const b = createRealSocrata({ fetchImpl, sleep: noSleep, minIntervalMs: 0 });
    expect((await a.count("abcd-1234")).count).toBe(7);
    await b.count("abcd-1234");
    expect(seen[0]["X-App-Token"]).toBe("tok");
    expect(seen[1]["X-App-Token"]).toBeUndefined();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ service: "socrata", status: 200, error: null, isMock: false, costUsd: 0, endpoint: "/resource/abcd-1234.json" });
  });

  it("logs failures (and survives a throwing logger)", async () => {
    const fetchImpl = (async () => json({ message: "no" }, 403)) as unknown as typeof fetch;
    const log: ApiCallRecord[] = [];
    const s = createRealSocrata({
      fetchImpl,
      sleep: noSleep,
      minIntervalMs: 0,
      retries: 0,
      onCall: (c) => {
        log.push(c);
        throw new Error("db down");
      },
    });
    await expect(s.query("abcd-1234", {})).rejects.toThrow(/403/);
    expect(log[0]).toMatchObject({ status: 403 });
    expect(log[0].error).toContain("403");
  });

  it("rejects non-array payloads", async () => {
    const fetchImpl = (async () => json({ error: true })) as unknown as typeof fetch;
    const s = createRealSocrata({ fetchImpl, sleep: noSleep, minIntervalMs: 0, retries: 0 });
    await expect(s.query("abcd-1234", {})).rejects.toThrow(/non-array/);
  });

  it("rate-limits concurrent calls", async () => {
    const waits: number[] = [];
    const fetchImpl = (async () => json([])) as unknown as typeof fetch;
    const s = createRealSocrata({ fetchImpl, minIntervalMs: 200, sleep: async (ms) => void waits.push(ms), cacheMaxEntries: 0 });
    await Promise.all([s.query("abcd-1234", { limit: 1 }), s.query("abcd-1234", { limit: 2 }), s.query("abcd-1234", { limit: 3 })]);
    expect(waits.length).toBeGreaterThanOrEqual(2);
  });

  it("caches in memory (bounded) and never keeps person names", async () => {
    const rows: SocrataRow[] = [
      { razon_social: "ANA PEREZ GOMEZ", nit: "123", organizacion_juridica: "PERSONA NATURAL" },
      { razon_social: "MARIA LOPEZ DIAZ E U", nit: "456", organizacion_juridica: "EMPRESAS UNIPERSONALES" },
      { razon_social: "CLINICA SONRISA SAS", nit: "789", organizacion_juridica: "SOCIEDAD LIMITADA" },
    ];
    const fetchImpl = vi.fn(async () => json(rows)) as unknown as typeof fetch;
    const s = createRealSocrata({ fetchImpl, sleep: noSleep, minIntervalMs: 0, cacheMaxEntries: 2 });
    await s.query("abcd-1234", {});
    const hit = await s.query("abcd-1234", {});
    expect(hit.fromCache).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const dump = JSON.stringify(hit.rows);
    expect(dump).not.toContain("ANA PEREZ");
    expect(dump).not.toContain("MARIA LOPEZ");
    expect(dump).toContain("CLINICA SONRISA SAS");
    expect(hit.rows[0].razon_social).toBe(REDACTED);
    // cached rows stay excluded when searched
    const src = createSocrataSource({ query: s.query, count: s.count, queryAll: async () => hit });
    const res = await src.searchRues({ ciiu: ["8622"], camara: "BOGOTA" });
    expect(res.companies.map((c) => c.name)).toEqual(["CLINICA SONRISA SAS"]);
    expect(res.excluded.lookalike).toBe(2);
    // LRU bound
    await s.query("abcd-1234", { limit: 1 });
    await s.query("abcd-1234", { limit: 2 });
    await s.query("abcd-1234", {});
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("redactRow leaves company rows untouched", () => {
    const r = { razon_social: "X SAS", organizacion_juridica: "SOCIEDAD LIMITADA" };
    expect(redactRow(r)).toBe(r);
    expect(isPersonalRow({ tipoid: "CC" })).toBe(true);
  });
});

describe("source + mock mode", () => {
  it("mock source returns flagged, filtered companies", async () => {
    const src = getSocrataSource(parseEnv({ SOCRATA_MODE: "mock" }));
    const rues = await src.searchRues({ ciiu: ["8622"], camara: "BOGOTA" });
    expect(rues.isMock).toBe(true);
    expect(rues.companies.length).toBeGreaterThan(3);
    expect(rues.companies.every((c) => c.isMock && c.isLegalEntity && !c.possibleNaturalPerson && c.externalId.startsWith("rues:"))).toBe(true);
    const reps = await src.searchReps({ municipio: "BOGOTA", service: "dental" });
    expect(reps.companies.length).toBeGreaterThan(3);
    expect(reps.companies.every((c) => c.isMock && c.externalId.startsWith("reps:"))).toBe(true);
  });

  it("mock adapter paginates and counts", async () => {
    const m = createMockSocrata();
    const p = await m.query("c82u-588k", { offset: 2, limit: 3 });
    expect(p.rows).toHaveLength(3);
    expect((await m.count("c36g-9fc2")).count).toBeGreaterThan(0);
    expect((await m.queryAll("c82u-588k", {}, { maxRows: 4 })).rows).toHaveLength(4);
  });

  it("real source builds safe queries from search params", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(decodeURIComponent(url).replace(/\+/g, " "));
      return json([]);
    }) as unknown as typeof fetch;
    const { createRealSocrata: mk } = await import("@/integrations/socrata/real");
    const src = createSocrataSource(mk({ fetchImpl, sleep: noSleep, minIntervalMs: 0 }));
    await src.searchRues({ ciiu: ["5611"], camara: "bogotá" });
    await src.searchReps({ municipio: "Bogotá", service: "dental", keywords: ["clinica"] });
    expect(urls[0]).toContain("c82u-588k.json");
    expect(urls[0]).toContain("camara_comercio='BOGOTÁ'");
    expect(urls[1]).toContain("c36g-9fc2.json");
    expect(urls[1]).toContain("like '%CLINICA%'");
    expect(urls[1]).toContain("like '%ODONT%'");
  });
});
