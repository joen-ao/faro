import { describe, expect, it } from "vitest";
import { parseContact } from "@/features/diagnostic/contact";
import { computeBenchmark, type PeerSite } from "@/features/diagnostic/benchmark";
import { whatsappHref } from "@/features/diagnostic/cta";
import { buildFindings, registryNote, safeHttpUrl, siteFactsFrom, type SourceInput } from "@/features/diagnostic/findings";
import { buildWidgetDoc, DAPTA_CONTAINER_ID, openOnLoadSrc } from "@/features/diagnostic/widget";
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
const NOW = new Date("2026-10-18T12:00:00Z");
const site = (signals: Record<string, unknown>, extra: Partial<SourceInput> = {}) =>
  src("website", { sourceUrl: "https://clinica.example/", raw: { fetchedPages: 2, signals }, ...extra });

describe("buildFindings (website presence)", () => {
  it("one card per website fact with status, why and one recommendation", () => {
    const facts = siteFactsFrom(
      [src("reps"), site({ onlineBooking: false, hasContactForm: false, copyrightYear: 2019, socialNetworks: ["instagram"] })],
      [{ type: "whatsapp", sourceChannel: "osm" }],
    );
    const f = buildFindings(company, facts, NOW);
    expect(f.map((x) => [x.id, x.status])).toEqual([
      ["booking", "opportunity"],
      ["whatsapp", "opportunity"], // a WhatsApp from another source does not count as "on the site"
      ["form", "opportunity"],
      ["freshness", "opportunity"],
      ["social", "ok"],
    ]);
    expect(f.every((x) => x.why.length > 20 && x.recommendation.length > 20 && x.sourceUrl === "https://clinica.example/")).toBe(true);
    expect(f.find((x) => x.id === "freshness")!.title).toContain("2019");
    expect(f.find((x) => x.id === "social")!.title).toContain("Instagram");
  });

  it("marks what already works and reads WhatsApp / form from the site's contact points", () => {
    const facts = siteFactsFrom(
      [site({ onlineBooking: true, copyrightYear: 2025 })],
      [
        { type: "whatsapp", sourceChannel: "website" },
        { type: "web_form", sourceChannel: "website" },
      ],
    );
    const f = buildFindings(company, facts, NOW);
    expect(f.map((x) => [x.id, x.status])).toEqual([
      ["booking", "ok"],
      ["whatsapp", "ok"],
      ["form", "ok"],
      ["freshness", "ok"],
    ]);
  });

  it("no data, no card: unknown signals produce no booking/form/year/social card", () => {
    const f = buildFindings(company, siteFactsFrom([site({})], []), NOW);
    expect(f.map((x) => x.id)).toEqual(["whatsapp"]);
  });

  it("without an enriched site shows one honest card; a known but unread site is 'sin revisar'", () => {
    const none = buildFindings(company, siteFactsFrom([src("reps"), src("website", { raw: { fetchedPages: 0, signals: {} } })], []), NOW);
    expect(none).toHaveLength(1);
    expect(none[0]).toMatchObject({ id: "no-website", status: "opportunity", title: "No encontramos un sitio web propio", sourceUrl: null });
    const unread = buildFindings({ ...company, website: "https://x.example" }, siteFactsFrom([], []), NOW);
    expect(unread).toHaveLength(1);
    expect(unread[0]).toMatchObject({ id: "site-unreviewed", status: "unknown" });
    expect(buildFindings({ ...company, website: "javascript:alert(1)" }, siteFactsFrom([], []), NOW)[0].id).toBe("no-website");
  });

  it("keeps the legacy hasBookingForm shape and marks mock sites as examples", () => {
    const f = buildFindings(company, siteFactsFrom([src("website", { raw: { hasBookingForm: false }, isMock: true })], []), NOW);
    expect(f[0]).toMatchObject({ id: "booking", status: "opportunity", isExample: true });
  });

  it("never links javascript: from stored source data", () => {
    const f = buildFindings(company, siteFactsFrom([site({ onlineBooking: true }, { sourceUrl: "javascript:alert(1)" })], []), NOW);
    expect(f.every((x) => x.sourceUrl === null)).toBe(true);
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
  });
});

describe("registryNote", () => {
  it("prefers REPS, keeps the license and falls back to the registry URL", () => {
    expect(registryNote([src("osm", { license: "ODbL" }), src("reps", { sourceUrl: "javascript:x", license: "CC BY-SA 4.0" })])).toEqual({
      label: "REPS (Registro Especial de Prestadores de Salud), datos.gov.co (CC BY-SA 4.0)",
      url: "https://www.datos.gov.co/",
      isExample: false,
    });
    expect(registryNote([src("website")])).toBeNull();
  });
});

describe("computeBenchmark", () => {
  const peer = (p: Partial<PeerSite> = {}): PeerSite => ({ onlineBooking: false, whatsapp: false, form: false, copyrightYear: null, ...p });
  const you = siteFactsFrom([site({ onlineBooking: true, copyrightYear: 2026 })], []);

  it("returns shares only from n >= 5 and per-metric n (updated counts peers with a year)", () => {
    const peers = [
      peer({ onlineBooking: true, whatsapp: true, copyrightYear: 2026 }),
      peer({ whatsapp: true, form: true, copyrightYear: 2020 }),
      peer({ whatsapp: true, copyrightYear: 2025 }),
      peer({ form: true }),
      peer(),
      peer({ whatsapp: true }),
    ];
    const b = computeBenchmark(you, peers, { city: "Bogotá", websiteKnown: true, now: NOW });
    const row = (k: string) => b.rows.find((r) => r.key === k)!;
    expect(row("booking")).toMatchObject({ you: true, n: 6 });
    expect(row("booking").pct).toBeCloseTo(1 / 6);
    expect(row("whatsapp")).toMatchObject({ you: false, n: 6 });
    expect(row("whatsapp").pct).toBeCloseTo(4 / 6);
    expect(row("form").pct).toBeCloseTo(2 / 6);
    expect(row("updated")).toMatchObject({ you: true, n: 3, pct: null }); // only 3 peers show a year
    expect(b.city).toBe("Bogotá");
  });

  it("withholds every percentage below 5 peers and answers 'no' when there is no website at all", () => {
    const b = computeBenchmark(siteFactsFrom([], []), [peer(), peer()], { city: null, websiteKnown: false, now: NOW });
    expect(b.rows.every((r) => r.pct === null && r.n <= 2 && r.you === false)).toBe(true);
    const unread = computeBenchmark(siteFactsFrom([], []), [], { city: null, websiteKnown: true, now: NOW });
    expect(unread.rows.every((r) => r.you === null)).toBe(true);
  });
});

describe("Dapta widget doc", () => {
  const snippet = '<script src="https://widget-v2.dapta.ai/agent.min.js?agentId=abc-123"></script>';
  it("loads the script in embedded mode with autoOpen and keeps the agentId", () => {
    const u = new URL(openOnLoadSrc(snippet)!);
    expect(u.searchParams.get("agentId")).toBe("abc-123");
    expect(u.searchParams.get("mode")).toBe("embedded");
    expect(u.searchParams.get("container")).toBe(DAPTA_CONTAINER_ID);
    expect(u.searchParams.get("autoOpen")).toBe("true");
    const doc = buildWidgetDoc(snippet);
    expect(doc).toContain(`id="${DAPTA_CONTAINER_ID}"`);
    expect(doc).toContain("toggleDaptaWidgetChat");
    expect(doc).toContain("faro-fallback");
  });
  it("leaves unknown snippets as they are (with the fallback watchdog)", () => {
    expect(openOnLoadSrc('<script src="https://evil.example/agent.min.js?agentId=x"></script>')).toBeNull();
    expect(openOnLoadSrc('<script src="https://widget-v2.dapta.ai/agent.min.js?env=_dev"></script>')).toBeNull();
    expect(buildWidgetDoc("<div>hola</div>")).toContain("<div>hola</div>");
  });
});

describe("whatsappHref", () => {
  it("builds a wa.me link with the company and slug, digits only, default number", () => {
    const h = whatsappHref(undefined, "Clínica Sonrisa SAS", "demo-clinica");
    expect(h.startsWith("https://wa.me/573014734934?text=")).toBe(true);
    const text = decodeURIComponent(h.split("text=")[1]!);
    expect(text).toContain("Clínica Sonrisa SAS");
    expect(text).toContain("demo-clinica");
    expect(whatsappHref("+57 300 111 2233", undefined, "icp:clinicas")).toMatch(/^https:\/\/wa\.me\/573001112233\?text=.*clinicas/);
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
