import { describe, expect, it } from "vitest";
import { parseContact } from "@/features/diagnostic/contact";
import { buildFindings, safeHttpUrl, type SourceInput } from "@/features/diagnostic/findings";
import { parseTracking } from "@/features/diagnostic/params";

describe("parseTracking", () => {
  it("accepts allowed c, s and utm_*", () => {
    expect(parseTracking({ c: "email", s: "osm", utm_source: "meta", utm_campaign: "abc-1" })).toEqual({
      c: "email",
      s: "osm",
      utm: { utm_source: "meta", utm_campaign: "abc-1" },
    });
  });
  it("drops invalid values independently and uses the first of repeated params", () => {
    const t = parseTracking({ c: "carrier-pigeon", s: ["reps", "osm"], utm_source: "<script>", utm_medium: "cpc" });
    expect(t).toEqual({ s: "reps", utm: { utm_medium: "cpc" } });
  });
  it("returns an empty object with no query", () => {
    expect(parseTracking({})).toEqual({});
  });
  it("rejects over-long utm values", () => {
    expect(parseTracking({ utm_term: "a".repeat(81) })).toEqual({});
  });
});

const src = (sourceChannel: string, extra: Partial<SourceInput> = {}): SourceInput => ({
  sourceChannel,
  sourceUrl: "https://example.org/x",
  license: null,
  isMock: false,
  raw: {},
  ...extra,
});
const company = { name: "Clínica X SAS", address: "Calle 1 # 2-3", city: "Bogotá", website: null };

describe("buildFindings", () => {
  it("returns at most 3 findings, each with an http(s) source", () => {
    const f = buildFindings(company, [src("osm"), src("reps"), src("rues"), src("google_places", { raw: { userRatingCount: 42 } }), src("website", { raw: { hasBookingForm: false } })]);
    expect(f).toHaveLength(3);
    expect(f.every((x) => /^https?:\/\//.test(x.sourceUrl))).toBe(true);
    expect(f[0].text).toContain("REPS");
  });
  it("describes reviews, booking form and OSM address from stored data", () => {
    const f = buildFindings(company, [src("google_places", { raw: { userRatingCount: 42 } }), src("website", { raw: { hasBookingForm: false } }), src("osm")]);
    expect(f.map((x) => x.text)).toEqual([
      "Tiene 42 reseñas públicas en Google Maps.",
      "Su sitio web no muestra un formulario para agendar citas.",
      "Está registrada en OpenStreetMap en Calle 1 # 2-3.",
    ]);
  });
  it("skips findings with no fact or no safe URL and never links javascript:", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    const f = buildFindings(company, [src("website", { raw: {} }), src("sample"), src("osm", { sourceUrl: "javascript:alert(1)" })]);
    expect(f.map((x) => x.id)).toEqual(["osm"]);
    expect(f[0].sourceUrl).toBe("https://www.openstreetmap.org/copyright");
  });
  it("marks mock sources as examples and returns [] without sources", () => {
    expect(buildFindings(company, [src("reps", { isMock: true })])[0].isExample).toBe(true);
    expect(buildFindings(company, [])).toEqual([]);
  });
});

const valid = { slug: "demo-clinica", company: "Clínica X SAS", email: "Info@clinica-x.co", message: "Queremos agendar una demo.", consent: true };

describe("parseContact", () => {
  it("accepts a company form with a generic mailbox and normalizes the email", () => {
    const r = parseContact(valid);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.data.email).toBe("info@clinica-x.co");
  });
  it("treats a filled honeypot as a bot, even if the rest is invalid", () => {
    expect(parseContact({ ...valid, hp: "http://spam" }).kind).toBe("bot");
    expect(parseContact({ hp: "x" }).kind).toBe("bot");
  });
  it("rejects personal mailboxes, missing consent and short messages with field errors", () => {
    const r = parseContact({ ...valid, email: "juan.perez@gmail.com", consent: false, message: "hi" });
    expect(r.kind).toBe("invalid");
    if (r.kind === "invalid") expect(Object.keys(r.errors).sort()).toEqual(["consent", "email", "message"]);
  });
  it("accepts an empty-string honeypot", () => {
    expect(parseContact({ ...valid, hp: "" }).kind).toBe("ok");
  });
});
