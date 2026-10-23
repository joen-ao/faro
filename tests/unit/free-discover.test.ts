import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, companySources, contactPoints, hunts, leads } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { enrichHunt } from "@/features/enrichment";
import { companySocialPages, contactsFromResult, guessDomains, pageNamesCompany, searchCompany } from "@/features/enrichment/free-discover";
import { createHunt } from "@/features/hunts/service";
import { ICP_EXAMPLES } from "@/features/icp/presets";
import { scoreFit } from "@/features/scoring/fit";
import type { WebSearchAdapter } from "@/integrations/web-search";
import { createRealWebsiteFetch } from "@/integrations/website-fetch";
import { extractPage, socialProfileUrls } from "@/integrations/website-fetch/extract";
import { createTestDb } from "../helpers/test-db";

describe("domain guess", () => {
  it("builds candidates from the distinctive words of the name", () => {
    expect(guessDomains("CONTABLEX SAS")).toEqual(["contablex.com.co", "contablex.com", "contablex.co"]);
    expect(guessDomains("ALFA DENTAL SAS")).toEqual(["alfadental.com.co", "alfadental.com", "alfadental.co", "alfa.com.co", "alfa.com", "alfa.co"]);
    expect(guessDomains("Ortodoncia Rafael Martinez S.A.S")).toContain("ortodonciarafaelmartinez.com");
    expect(guessDomains("SAS LTDA")).toEqual([]);
  });
  it("accepts a page only when it names the company and is not a parked domain", () => {
    expect(pageNamesCompany("Bienvenidos a Contablex, firma contable en Bogotá", "CONTABLEX SAS", { city: "Bogota" })).toBe(true);
    expect(pageNamesCompany("Este dominio contablex está en venta. Colombia", "CONTABLEX SAS")).toBe(false);
    expect(pageNamesCompany("Otra empresa en Colombia", "CONTABLEX SAS")).toBe(false);
    // Same name, another country: rejected.
    expect(pageNamesCompany("Profesionales & Consultores, Asunción", "PROFESIONALES & CONSULTORES SAS", { city: "Bogota", phones: ["+595984574259"] })).toBe(false);
    expect(pageNamesCompany("Profesionales & Consultores, Asunción", "PROFESIONALES & CONSULTORES SAS", { phones: ["+576013251201"] })).toBe(true);
    // Only part of the name (Altia Seguros is not Altia Consultores).
    expect(pageNamesCompany("Altia Seguros Colombia", "ALTIA CONSULTORES SAS")).toBe(false);
  });
});

describe("social pages", () => {
  it("keeps company pages and drops share buttons, posts and personal LinkedIn profiles", () => {
    expect(
      socialProfileUrls([
        "https://www.instagram.com/contablex/",
        "https://www.facebook.com/sharer/sharer.php?u=x",
        "https://instagram.com/p/abc123",
        "https://www.linkedin.com/in/juan-perez",
        "https://co.linkedin.com/company/contablex-sas",
        "https://m.facebook.com/ContablexSAS",
        "https://www.tiktok.com/@contablex",
      ]),
    ).toEqual(["https://www.instagram.com/contablex", "https://www.linkedin.com/company/contablex-sas", "https://www.facebook.com/contablexsas", "https://www.tiktok.com/@contablex"]);
  });
  it("stores the social pages a company links from its own site", () => {
    const p = extractPage('<a href="https://www.instagram.com/clinicasol/">IG</a><a href="https://facebook.com/sharer.php">x</a>', "https://clinicasol.co/");
    expect(p.contacts.filter((c) => c.type === "social")).toEqual([{ type: "social", value: "https://www.instagram.com/clinicasol", isGeneric: false, evidenceUrl: "https://clinicasol.co/" }]);
  });
  it("only takes a search result as the company page when the handle or title carries its name", () => {
    const pages = companySocialPages("CONTABLEX SAS", [
      { url: "https://www.instagram.com/contablex.co/", title: "Contablex (@contablex.co)", snippet: "" },
      { url: "https://www.instagram.com/otraempresa/", title: "Otra", snippet: "" },
      { url: "https://www.facebook.com/firmaxyz", title: "Contablex SAS - Inicio", snippet: "" },
    ]);
    expect(pages.map((p) => p.url)).toEqual(["https://www.instagram.com/contablex.co", "https://www.facebook.com/firmaxyz"]);
  });
  it("reads generic contacts from the public snippet, never personal mailboxes", () => {
    const c = contactsFromResult({ url: "https://www.instagram.com/contablex", title: "Contablex", snippet: "Firma contable 📞 310 555 0101 · info@contablex.co · juan.perez@gmail.com · wa.me/573105550102" });
    expect(c).toEqual([
      { type: "email", value: "info@contablex.co", isGeneric: true, evidenceUrl: "https://www.instagram.com/contablex" },
      { type: "phone", value: "+573105550101", isGeneric: true, evidenceUrl: "https://www.instagram.com/contablex" },
      { type: "whatsapp", value: "+573105550102", isGeneric: false, evidenceUrl: "https://www.instagram.com/contablex" },
    ]);
  });
  it("one search finds the own site, the social page and its contacts", async () => {
    const search: WebSearchAdapter = {
      provider: "brave",
      minIntervalMs: 0,
      search: async () => ({
        latencyMs: 1,
        results: [
          { url: "https://www.paginasamarillas.com.co/contablex", title: "Contablex", snippet: "" },
          { url: "https://www.instagram.com/contablex/", title: "Contablex SAS (@contablex)", snippet: "Contadores en Bogotá. Tel 601 555 0123" },
          { url: "https://contablex.com.co/contacto", title: "Contablex", snippet: "info@contablex.com.co" },
        ],
      }),
    };
    const r = await searchCompany("CONTABLEX SAS", "Bogota", search);
    expect(r.website).toBe("https://contablex.com.co");
    expect(r.social).toEqual(["https://www.instagram.com/contablex"]);
    expect(r.contacts.map((c) => `${c.type}:${c.value}`)).toEqual(["email:info@contablex.com.co", "phone:+576015550123", "social:https://www.instagram.com/contablex"]);
  });
});

describe("scoring without a website", () => {
  it("a company page in social networks counts as digital presence", async () => {
    const r = await scoreFit(
      {
        name: "Contablex SAS",
        city: "Bogota",
        website: null,
        nit: null,
        isLegalEntity: true,
        contacts: [{ type: "social", value: "https://www.instagram.com/contablex", isGeneric: false, evidenceUrl: "https://www.instagram.com/contablex" }],
        sources: [],
        websiteText: null,
      },
      ICP_EXAMPLES[0].criteria,
    );
    const presence = r.criteria.find((c) => c.criterio.startsWith("Sitio web o redes"))!;
    expect(presence.cumplido).toBe(true);
    expect(presence.evidencia).toContain("instagram.com/contablex");
  });
});

describe("free discovery inside enrichHunt", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let db: AppDb;
  beforeAll(async () => {
    conn = await createTestDb();
    db = conn.db as unknown as AppDb;
  });
  afterAll(() => conn.close());

  const sites = () =>
    createRealWebsiteFetch({
      fetchImpl: (async (u: string | URL | Request) => {
        const url = String(u);
        if (url.endsWith("robots.txt")) return new Response("", { status: 404 });
        if (url.includes("alfadental")) return new Response("<html><title>Alfa Dental</title><body>Alfa Dental, clínica en Bogotá. info@alfadental.com.co</body></html>", { status: 200, headers: { "content-type": "text/html" } });
        return new Response("<html><body>Otra cosa</body></html>", { status: 200, headers: { "content-type": "text/html" } });
      }) as unknown as typeof fetch,
      resolve: async () => ["93.184.216.34"],
      minIntervalMs: 0,
    });

  it("guesses the domain, then searches the rest; stores site, social page and contacts at no cost", async () => {
    const { huntId } = await createHunt(db, { prompt: "Clinicas dentales en Bogota", criteria: ICP_EXAMPLES[0].criteria, threshold: 40 });
    const seed = async (name: string) => {
      const [c] = await db.insert(companies).values({ name, normalizedName: name.toLowerCase(), city: "Bogota", isLegalEntity: true }).returning();
      await db.insert(companySources).values({ companyId: c!.id, sourceChannel: "rues", externalId: `rues:${c!.id}`, raw: { ciiu: "8622" }, sourceUrl: `https://rues.test/${c!.id}` });
      const [l] = await db.insert(leads).values({ companyId: c!.id, huntId, primarySource: "rues", slug: `s-${c!.id.slice(0, 10)}` }).returning();
      return { companyId: c!.id, leadId: l!.id };
    };
    const alfa = await seed("ALFA DENTAL SAS");
    const beta = await seed("BETA SONRISAS SAS");
    const queries: string[] = [];
    const search: WebSearchAdapter = {
      provider: "google",
      minIntervalMs: 0,
      search: async (q) => {
        queries.push(q);
        return { latencyMs: 1, results: [{ url: "https://www.instagram.com/betasonrisas/", title: "Beta Sonrisas (@betasonrisas)", snippet: "Clínica dental · 310 555 0199" }] };
      },
    };
    const resolve = async (host: string) => host === "alfadental.com.co";
    const r = await enrichHunt(db, huntId, { fetch: sites(), search, resolve });
    expect(r).toMatchObject({ discovering: true, sitiosBuscados: 2, sitiosEncontrados: 1, redesEncontradas: 1, costoApifyUsd: 0 });
    expect(queries).toEqual(["beta sonrisas Bogota"]);
    const [a] = await db.select({ website: companies.website }).from(companies).where(eq(companies.id, alfa.companyId));
    expect(a!.website).toBe("https://alfadental.com.co");
    const cps = await db.select().from(contactPoints).where(eq(contactPoints.companyId, beta.companyId));
    expect(cps.map((c) => `${c.type}:${c.value}`).sort()).toEqual(["phone:+573105550199", "social:https://www.instagram.com/betasonrisas"]);
    // Beta has no website but now has a social page and a business phone: it is re-scored right away.
    const [bl] = await db.select({ fitScore: leads.fitScore }).from(leads).where(eq(leads.id, beta.leadId));
    expect(bl!.fitScore).toBeGreaterThan(0);
    const [h] = await db.select({ progress: hunts.progress }).from(hunts).where(eq(hunts.id, huntId));
    expect((h!.progress as { websiteSearch?: { free?: string[] } }).websiteSearch?.free?.sort()).toEqual([alfa.companyId, beta.companyId].sort());
    // Next call: nobody left to discover -> the regular pass reads Alfa's guessed site.
    const next = await enrichHunt(db, huntId, { fetch: sites(), search, resolve });
    expect(next.discovering).toBe(false);
    expect(next.enriquecidos).toBe(1);
  });
});

describe("monthly cap on the free search", () => {
  it("never makes more search calls than the monthly limit and still finishes the pass", async () => {
    const conn = await createTestDb();
    const db = conn.db as unknown as AppDb;
    try {
      const { apiCalls } = await import("@/db/schema");
      const { huntId } = await createHunt(db, { prompt: "Clinicas dentales en Bogota", criteria: ICP_EXAMPLES[0].criteria, threshold: 40 });
      for (const name of ["UNO DENTAL SAS", "DOS SONRISA SAS", "TRES ORAL SAS"]) {
        const [c] = await db.insert(companies).values({ name, normalizedName: name.toLowerCase(), city: "Bogota", isLegalEntity: true }).returning();
        await db.insert(leads).values({ companyId: c!.id, huntId, primarySource: "rues", slug: `s-${c!.id.slice(0, 10)}` });
      }
      // 899 calls already made this month: only one more is allowed with a limit of 900.
      await db.insert(apiCalls).values(Array.from({ length: 899 }, () => ({ service: "web_search_brave", endpoint: "search", status: 200, latencyMs: 1, costUsd: 0 })));
      let calls = 0;
      const search: WebSearchAdapter = { provider: "brave", minIntervalMs: 0, search: async () => (calls++, { latencyMs: 1, results: [] }) };
      const r = await enrichHunt(db, huntId, { fetch: createRealWebsiteFetch({ fetchImpl: (async () => new Response("", { status: 404 })) as unknown as typeof fetch, resolve: async () => ["93.184.216.34"], minIntervalMs: 0 }), search, searchMonthlyLimit: 900, resolve: async () => false });
      expect(calls).toBe(1);
      expect(r.notas.join(" ")).toContain("Tope mensual de 900");
      const [h] = await db.select({ progress: hunts.progress }).from(hunts).where(eq(hunts.id, huntId));
      expect((h!.progress as { websiteSearch?: { free?: string[] } }).websiteSearch?.free).toHaveLength(3);
    } finally {
      await conn.close();
    }
  });
});

describe("search query and site picking", () => {
  it("searches the name without legal forms and accepts a site the result title confirms", async () => {
    const { searchName, pickSiteFromResults } = await import("@/features/enrichment/free-discover");
    expect(searchName("ORTODONCIA RAFAEL MARTINEZ S.A.S")).toBe("ortodoncia rafael martinez");
    expect(searchName("CEGAP ASOCIADOS S.A.S - EN LIQUIDACION")).toBe("cegap asociados");
    expect(
      pickSiteFromResults("BRITEK TRIBUTO SAS", [
        { url: "https://www.emis.com/x", title: "Britek Tributo S.A.S Perfil", snippet: "" },
        { url: "https://britek.com.co/", title: "Britek / - Tributo Servicios de Documentación Electrónica", snippet: "" },
      ]),
    ).toBe("https://britek.com.co");
    // Same word in the domain but the title does not name the company: rejected.
    expect(pickSiteFromResults("BRITEK TRIBUTO SAS", [{ url: "https://britek.com.co/", title: "Britek Seguros", snippet: "" }])).toBeUndefined();
  });
});

describe("search results are verified like guessed domains", () => {
  it("drops a found site whose page does not name the company", async () => {
    const search: WebSearchAdapter = { provider: "brave", minIntervalMs: 0, search: async () => ({ latencyMs: 1, results: [{ url: "https://grupoenergiabogota.com/", title: "Grupo Energía Bogotá", snippet: "" }] }) };
    const fetcher = createRealWebsiteFetch({
      fetchImpl: (async (u: string | URL | Request) => (String(u).endsWith("robots.txt") ? new Response("", { status: 404 }) : new Response("<html><body>Grupo Energía Bogotá, Colombia</body></html>", { status: 200, headers: { "content-type": "text/html" } }))) as unknown as typeof fetch,
      resolve: async () => ["93.184.216.34"],
      minIntervalMs: 0,
    });
    const r = await searchCompany("ITS ENERGIA S.A.S", "Bogota", search, fetcher);
    expect(r.website).toBeUndefined();
  });
});
