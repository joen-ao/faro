import { describe, expect, it } from "vitest";
import { fieldCoverage, isGenericEmail, nameOverlap, normalizeName, pct, uniqueNames } from "@/features/coverage/metrics";
import { recommend, renderReport, scoreIcp, type CoverageRun, type IcpReport } from "@/features/coverage/report";

describe("normalizeName", () => {
  it("strips accents, punctuation, legal suffixes and generic words", () => {
    expect(normalizeName("Clínica Odontológica Sonríe S.A.S.")).toBe("sonrie");
    expect(normalizeName("ORALLIFE LTDA")).toBe("orallife");
    expect(normalizeName("Restaurante El Cielo & Cía")).toBe("cielo");
  });
  it("falls back to a non-empty name when everything is generic", () => {
    expect(normalizeName("Clínica Dental")).not.toBe("");
    expect(normalizeName(undefined)).toBe("");
  });
});

describe("percentages", () => {
  it("computes pct and handles zero denominators", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(0, 0)).toBeNull();
  });
  it("counts non-blank values", () => {
    const c = fieldCoverage([{ w: "a.com" }, { w: " " }, { w: undefined }, { w: "b.co" }], (x) => x.w);
    expect(c).toEqual({ withValue: 2, of: 4, pct: 50 });
  });
  it("accepts boolean pickers", () => {
    expect(fieldCoverage([1, 2, 3], (n) => n > 1).withValue).toBe(2);
  });
});

describe("overlap", () => {
  it("matches by normalized name", () => {
    const o = nameOverlap(["Orallife S.A.S.", "Acadent", ""], ["ORALLIFE", "Otra"]);
    expect(o.matched).toBe(1);
    expect(o.aTotal).toBe(2);
    expect(o.pctOfA).toBe(50);
    expect(o.pctOfB).toBe(50);
  });
  it("counts unique names", () => {
    expect(uniqueNames(["Foo SAS", "foo", "Bar"])).toBe(2);
  });
});

const mk = (id: string, title: string, osmTotal: number, osmWeb: number, verified: number, toVerify: number, verifiable = true): IcpReport => ({
  id,
  title,
  overlaps: [],
  sources: [{ source: "osm", label: "OSM", ok: true, total: osmTotal }],
  metrics: {
    osmWebOrEmail: osmWeb,
    contact: { verified, verifiedFromReps: verified, verifiedFromOsm: 0, toVerify, verifiable },
  },
});

describe("recommendation and report", () => {
  it("decides by verified contactables, shows both metrics, and text follows the winner", () => {
    const scores = [
      scoreIcp(mk("d", "Dental · Bogotá", 100, 5, 53, 60)),
      scoreIcp(mk("r", "Restaurantes · Bogotá", 1000, 150, 20, 150)),
      scoreIcp(mk("m", "Restaurantes · Miami", 500, 300, 0, 300, false)),
    ];
    const text = recommend(scores);
    expect(text).toContain("ICP principal, envíos reales): Dental · Bogotá");
    expect(text).toContain("(a)");
    expect(text).toContain("(b)");
    expect(text).toContain("Restaurantes · Miami");
    expect(text).toContain("N/D");
  });

  it("flips the winner when verified counts flip", () => {
    const scores = [scoreIcp(mk("d", "Dental · Bogotá", 100, 50, 10, 60)), scoreIcp(mk("r", "Restaurantes · Bogotá", 1000, 150, 40, 150))];
    expect(recommend(scores)).toContain("envíos reales): Restaurantes · Bogotá");
  });

  it("reports failed sources honestly without numbers", () => {
    const run: CoverageRun = {
      generatedAt: "now",
      timeZone: "America/Bogota",
      icps: [{ id: "x", title: "X · Bogotá", overlaps: [], sources: [{ source: "osm", label: "OSM", ok: false, error: "HTTP 504" }] }],
    };
    const md = renderReport(run, []);
    expect(md).toContain("FALLÓ");
    expect(md).toContain("HTTP 504");
    expect(md).toContain("OpenStreetMap contributors");
    expect(md).toContain("CC BY-SA 4.0");
  });
});

describe("isGenericEmail", () => {
  it("accepts role mailboxes and rejects personal-looking ones", () => {
    expect(isGenericEmail("info@clinica.co")).toBe(true);
    expect(isGenericEmail("Citas@x.com")).toBe(true);
    expect(isGenericEmail("maria.gomez@gmail.com")).toBe(false);
    expect(isGenericEmail(undefined)).toBe(false);
  });
});
