import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { companies, companySources, costEntries, leads } from "@/db/schema";
import { isGenericEmail } from "@/features/compliance/email";
import { enrichCompany } from "@/features/enrichment";
import { ApifyError } from "@/integrations/apify";
import { createRealWebsiteFetch } from "@/integrations/website-fetch";
import { extractPage } from "@/integrations/website-fetch/extract";
import { createTestDb } from "../helpers/test-db";

const PUBLIC = async () => ["93.184.216.34"];
type Route = { status?: number; body?: string; headers?: Record<string, string> };

function make(routes: Record<string, Route>, extra: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const r = routes[url] ?? { status: 404 };
    return new Response(r.body ?? "", { status: r.status ?? 200, headers: { "content-type": "text/html", ...r.headers } });
  }) as unknown as typeof fetch;
  return { adapter: createRealWebsiteFetch({ fetchImpl: fn, resolve: PUBLIC, minIntervalMs: 0, ...extra }), calls, fn };
}

describe("isGenericEmail strict local part", () => {
  it("accepts exact generic tokens with digits or separated suffixes", () => {
    for (const e of ["info@x.co", "info.bogota@x.co", "citas-norte@x.co", "contacto2@x.co", "Contacto@x.co", "ventas_cali@x.co", "info+web@x.co"]) expect(isGenericEmail(e), e).toBe(true);
  });
  it("rejects glued prefixes and personal suffixes", () => {
    for (const e of ["clinicajuanperez@x.co", "odontomaria@x.co", "dentalcarlos@x.co", "adminluis@x.co", "info.juan@x.co", "clinica.maria@x.co", "camila.perez@x.co", "drgomez@x.co", "", "sin-arroba"]) expect(isGenericEmail(e), e).toBe(false);
  });
});

describe("fetch guards", () => {
  it("blocks Google Maps and social networks, also via redirect and allows()", async () => {
    const urls = ["https://www.google.com/maps/place/x", "https://maps.app.goo.gl/abc", "https://goo.gl/maps/abc", "https://share.google/abc", "https://clinica.business.site/", "https://www.facebook.com/clinica", "https://instagram.com/c", "https://www.tiktok.com/@c", "https://x.com/c", "https://twitter.com/c", "https://www.linkedin.com/company/c"];
    for (const url of urls) {
      const { adapter, calls } = make({});
      const r = await adapter.fetchSite(url);
      expect(r.error, url).toBe("blocked_social_or_maps");
      expect(calls, url).toHaveLength(0);
      expect(await adapter.allows(url), url).toBe(false);
    }
    const { adapter, calls } = make({
      "https://clinica.test/robots.txt": { status: 404 },
      "https://clinica.test/": { status: 302, headers: { location: "https://www.facebook.com/clinica" } },
    });
    expect((await adapter.fetchSite("https://clinica.test/")).error).toBe("blocked_social_or_maps");
    expect(calls).not.toContain("https://www.facebook.com/clinica");
  });

  it("robots 429 means do not crawl", async () => {
    const { adapter } = make({ "https://clinica.test/robots.txt": { status: 429 }, "https://clinica.test/": { body: "<p>x</p>" } });
    expect((await adapter.fetchSite("https://clinica.test/")).error).toBe("robots_disallow");
  });

  it("global deadline stops the crawl", async () => {
    let t = 0;
    const { adapter } = make({ "https://clinica.test/robots.txt": { status: 404 }, "https://clinica.test/": { body: "<p>x</p>" } }, { deadlineMs: 10, now: () => (t += 20) });
    expect((await adapter.fetchSite("https://clinica.test/")).error).toBe("deadline");
  });
});

describe("name redaction", () => {
  it("redacts Od./Lic./Esp./Ing./Mg. titles and founder/manager phrases", () => {
    const txt = extractPage(
      "<title>Dra. Laura Mora Odontología</title><p>Od. María Gómez es la ortodoncista. Fundada por Carlos Pérez. Lic. Ana Ruiz. Esp. Juan Díaz. Ing. Pedro Salas. Mg. Rosa León. La gerente Marta Rojas Peña atiende. Director Médico Luis Ortiz. Dr. Pedro Salas. Odontología integral.</p>",
      "https://a.test/",
    ).text;
    for (const n of ["María", "Gómez", "Carlos", "Pérez", "Ana Ruiz", "Juan", "Díaz", "Pedro", "Rosa", "Marta", "Rojas", "Luis", "Ortiz", "Laura", "Mora"]) expect(txt, n).not.toContain(n);
    expect(txt).toContain("Odontología integral");
  });
});

describe("enrich r1 fixes", () => {
  it("failed run cost is recorded; failed re-fetch keeps the previous source; demo never uses real Apify", async () => {
    const conn = await createTestDb();
    try {
      const [c] = await conn.db.insert(companies).values({ name: "R1", normalizedName: "r1", website: "https://real.test/" }).returning();
      const [l] = await conn.db.insert(leads).values({ companyId: c!.id, primarySource: "osm", slug: "r1-a" }).returning();
      const ok = make({ "https://real.test/robots.txt": { status: 404 }, "https://real.test/": { body: "<title>Buena</title>" } }).adapter;
      await enrichCompany(conn.db, c!.id, { fetch: ok });
      const down = createRealWebsiteFetch({ fetchImpl: (async () => { throw new Error("x"); }) as unknown as typeof fetch, resolve: PUBLIC, minIntervalMs: 0 });
      const failing = { scrapeContacts: async () => { throw new ApifyError("run failed", undefined, 0.02, "rf"); } };
      const s = await enrichCompany(conn.db, c!.id, { fetch: ok, apify: failing, useApify: true });
      expect(s.apify?.used).toBe(false);
      const costs = await conn.db.select().from(costEntries).where(eq(costEntries.leadId, l!.id));
      expect(costs).toHaveLength(1);
      expect(costs[0]).toMatchObject({ usd: 0.02, category: "scraping" });
      expect(costs[0]!.evidence).toContain("rf");
      expect((await enrichCompany(conn.db, c!.id, { fetch: down })).status).toBe("no_pages");
      const [src] = await conn.db.select().from(companySources).where(eq(companySources.companyId, c!.id));
      expect((src!.raw as { websiteText: string }).websiteText).toContain("Buena");

      const [d] = await conn.db.insert(companies).values({ name: "D", normalizedName: "d", website: "https://d.example.com", isDemo: true }).returning();
      const spy = vi.fn();
      await enrichCompany(conn.db, d!.id, { fetch: ok, apify: { scrapeContacts: spy }, useApify: true });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      await conn.close();
    }
  });
});
