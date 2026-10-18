import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { apiCalls, companies, companySources, contactPoints, costEntries, leads } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { deduceWebsite, enrichHunt, NON_COMPANY_DOMAINS } from "@/features/enrichment";
import { createHunt } from "@/features/hunts/service";
import { ICP_EXAMPLES } from "@/features/icp/presets";
import { buildActorInput, createRealApify, toContactItem, type ApifyAdapter, type ApifyRunResult } from "@/integrations/apify";
import { createRealWebsiteFetch } from "@/integrations/website-fetch";
import { createTestDb } from "../helpers/test-db";

const criteria = ICP_EXAMPLES[0].criteria;

let conn: Awaited<ReturnType<typeof createTestDb>>;
let db: AppDb;
beforeAll(async () => {
  conn = await createTestDb();
  db = conn.db as unknown as AppDb;
});
afterAll(() => conn.close());

/** Fake internet: every host `*.test` serves a home page with online booking + a WhatsApp link, except `ghost.test` (404). */
function fakeSites() {
  const hits: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const f = (async (u: string | URL | Request) => {
    const url = String(u);
    hits.push(url);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    if (url.endsWith("robots.txt")) return new Response("", { status: 404 });
    if (url.includes("ghost.test")) return new Response("", { status: 404, headers: { "content-type": "text/html" } });
    const html = `<html><body><p>Agenda tu cita en línea</p><a href="https://wa.me/573105550101">WhatsApp</a><a href="tel:+576015550123">tel</a></body></html>`;
    return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
  return { hits, max: () => maxInFlight, adapter: createRealWebsiteFetch({ fetchImpl: f, resolve: async () => ["93.184.216.34"], minIntervalMs: 0 }) };
}

async function seedHunt(threshold = 40) {
  const { huntId } = await createHunt(db, { prompt: "Clinicas dentales en Bogota", criteria, threshold });
  return huntId;
}

async function seedLead(huntId: string, o: { name: string; website?: string | null; emails?: string[]; isDemo?: boolean }) {
  const [c] = await db
    .insert(companies)
    .values({ name: o.name, normalizedName: o.name.toLowerCase(), city: "Bogota", website: o.website ?? null, isDemo: !!o.isDemo })
    .returning();
  await db.insert(companySources).values({ companyId: c!.id, sourceChannel: "osm", externalId: `osm:${c!.id}`, raw: { tags: { amenity: "dentist" } }, sourceUrl: `https://osm.test/${c!.id}` });
  for (const e of o.emails ?? []) await db.insert(contactPoints).values({ companyId: c!.id, type: "email", value: e, isGeneric: true, sourceChannel: "osm" });
  const [l] = await db.insert(leads).values({ companyId: c!.id, huntId, primarySource: "osm", slug: `s-${c!.id.slice(0, 10)}`, isDemo: !!o.isDemo }).returning();
  return { companyId: c!.id, leadId: l!.id };
}

describe("domain deduction", () => {
  it("deduces the own domain from a generic mailbox and ignores free mail and shared platforms", () => {
    expect(deduceWebsite(["info@clinica-sonrisa.co"])).toBe("https://clinica-sonrisa.co");
    expect(deduceWebsite(["info@gmail.com", "citas@hotmail.com", "hola@outlook.com", "info@yahoo.com", "x@linktr.ee", "y@wixsite.com"])).toBeUndefined();
    expect(deduceWebsite(["info@gmail.com", "contacto@www.dental.test"])).toBe("https://dental.test");
    for (const d of ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "facebook.com", "linktr.ee", "business.site"]) expect(NON_COMPANY_DOMAINS).toContain(d);
  });
});

describe("enrichHunt", () => {
  it("skips demo leads and leads without website or own domain", async () => {
    const huntId = await seedHunt();
    await seedLead(huntId, { name: "Demo SA", website: "https://demo.test", isDemo: true });
    await seedLead(huntId, { name: "Sin Sitio", emails: ["info@gmail.com"] });
    const sites = fakeSites();
    const r = await enrichHunt(db, huntId, { fetch: sites.adapter });
    expect(r).toMatchObject({ revisados: 0, total: 0, done: true });
    expect(sites.hits).toHaveLength(0);
  });

  it("fetches with concurrency 4, saves deduced websites, counts agenda/whatsapp, skips fresh ones and re-scores", async () => {
    const huntId = await seedHunt(60);
    const withSite = await Promise.all(Array.from({ length: 6 }, (_, i) => seedLead(huntId, { name: `Clinica Dental Sitio ${i}`, website: `https://sitio${i}.test` })));
    const deduced = await seedLead(huntId, { name: "Clinica Dental Deducida", emails: ["info@deducida.test", "citas@gmail.com"] });
    const shared = await seedLead(huntId, { name: "Clinica Dental Gmail", emails: ["info@gmail.com"] });
    const sites = fakeSites();

    const [before] = await db.select().from(leads).where(eq(leads.id, deduced.leadId));
    expect(before!.fitScore).toBeNull();
    const r = await enrichHunt(db, huntId, { fetch: sites.adapter, limit: 50 });
    expect(r).toMatchObject({ revisados: 7, enriquecidos: 7, conAgenda: 7, conWhatsapp: 7, dominiosDeducidos: 1, total: 7, done: true, costoApifyUsd: 0 });
    expect(r.contactosNuevos).toBeGreaterThanOrEqual(14);
    expect(sites.max()).toBeLessThanOrEqual(4);
    expect(sites.max()).toBeGreaterThan(1);

    const [c] = await db.select().from(companies).where(eq(companies.id, deduced.companyId));
    expect(c!.website).toBe("https://deducida.test");
    const [g] = await db.select().from(companies).where(eq(companies.id, shared.companyId));
    expect(g!.website).toBeNull();

    // Re-scored: every touched lead now has a score and the ones above the threshold were promoted.
    const rows = await db.select().from(leads).where(inArray(leads.id, [...withSite.map((w) => w.leadId), deduced.leadId]));
    expect(rows.every((x) => x.fitScore !== null && x.fitScore > 0)).toBe(true);
    expect(r.promovidosAFit).toBeGreaterThan(0);
    expect(rows.filter((x) => x.status === "fit")).toHaveLength(r.promovidosAFit);

    // < 24 h: nothing is fetched again.
    const hits = sites.hits.length;
    const again = await enrichHunt(db, huntId, { fetch: sites.adapter, limit: 50 });
    expect(again).toMatchObject({ revisados: 0, omitidosRecientes: 7, done: true });
    expect(sites.hits.length).toBe(hits);

    // > 24 h: it is enriched again.
    const later = Date.now() + 25 * 3600 * 1000;
    const stale = await enrichHunt(db, huntId, { fetch: sites.adapter, limit: 50, now: () => later });
    expect(stale.revisados).toBe(7);
  });

  it("pages with a cursor and reports done only on the last page", async () => {
    const huntId = await seedHunt();
    for (let i = 0; i < 5; i++) await seedLead(huntId, { name: `Pag ${i}`, website: `https://pag${i}.test` });
    const sites = fakeSites();
    const a = await enrichHunt(db, huntId, { fetch: sites.adapter, limit: 2 });
    expect(a).toMatchObject({ revisados: 2, nextCursor: 2, total: 5, done: false });
    const b = await enrichHunt(db, huntId, { fetch: sites.adapter, limit: 2, cursor: a.nextCursor });
    const c = await enrichHunt(db, huntId, { fetch: sites.adapter, limit: 2, cursor: b.nextCursor });
    expect(c).toMatchObject({ revisados: 1, nextCursor: 5, done: true });
  });

  it("stops starting work when the time budget is spent and does not advance past unprocessed leads", async () => {
    const huntId = await seedHunt();
    for (let i = 0; i < 6; i++) await seedLead(huntId, { name: `Tiempo ${i}`, website: `https://tiempo${i}.test` });
    let t = 0;
    const r = await enrichHunt(db, huntId, { fetch: fakeSites().adapter, limit: 6, concurrency: 1, budgetMs: 1000, now: () => (t += 400) });
    expect(r.revisados).toBeLessThan(6);
    expect(r.done).toBe(false);
    expect(r.nextCursor).toBe(r.revisados);
  });
});

describe("enrichHunt with Apify", () => {
  function fakeApify(opts: { usd: number; fail?: boolean } = { usd: 0.03 }) {
    const calls: string[][] = [];
    const adapter: ApifyAdapter = {
      async scrapeContacts(urls): Promise<ApifyRunResult> {
        calls.push(urls);
        if (opts.fail) throw new Error("boom");
        return {
          items: urls.map((u) => ({ url: u, emails: ["info@" + new URL(u).hostname, "maria.lopez@" + new URL(u).hostname], phones: ["+57 601 555 0188"], whatsapps: ["573105550177"] })),
          runId: "run-x",
          usageTotalUsd: opts.usd,
          latencyMs: 10,
          isMock: false,
        };
      },
    };
    return { calls, adapter };
  }

  it("runs one Apify run per batch of <= 25 URLs and prorates the real cost per company", async () => {
    const huntId = await seedHunt();
    const seeded = await Promise.all(Array.from({ length: 27 }, (_, i) => seedLead(huntId, { name: `Apify ${i}`, website: `https://apify${i}.test` })));
    const apify = fakeApify({ usd: 0.5 });
    const r = await enrichHunt(db, huntId, { fetch: fakeSites().adapter, apify: apify.adapter, useApify: true, limit: 50 });
    expect(apify.calls.map((c) => c.length)).toEqual([25, 2]);
    expect(r.costoApifyUsd).toBe(1);
    const costs = await db.select().from(costEntries).where(eq(costEntries.huntId, huntId));
    const total = costs.reduce((s, c) => s + c.usd, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(costs.every((c) => c.category === "scraping" && !c.isMock)).toBe(true);
    // run 1: 0.5 / 25 = 0.02 per company; run 2: 0.5 / 2 = 0.25 per company.
    const byLead = new Map(costs.map((c) => [c.leadId, c.usd]));
    const perCompany = seeded.map((s) => byLead.get(s.leadId)!);
    expect(perCompany.filter((x) => Math.abs(x - 0.02) < 1e-6)).toHaveLength(25);
    expect(perCompany.filter((x) => Math.abs(x - 0.25) < 1e-6)).toHaveLength(2);
    // Apify contacts: generic email + phone + whatsapp, never the personal-looking address.
    const cps = await db.select().from(contactPoints).where(eq(contactPoints.companyId, seeded[0]!.companyId));
    const keys = cps.map((c) => `${c.type}:${c.value}`);
    expect(keys).toContain("email:info@apify0.test");
    expect(keys).toContain("whatsapp:+573105550177");
    expect(keys.some((k) => k.includes("maria.lopez"))).toBe(false);
    expect(r.conWhatsapp).toBe(27);
    const calls = await db.select().from(apiCalls).where(eq(apiCalls.service, "apify"));
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("never sends Google Maps or social URLs to Apify and keeps direct-fetch results when Apify fails", async () => {
    const huntId = await seedHunt();
    await seedLead(huntId, { name: "Con Maps", website: "https://www.google.com/maps/place/Clinica" });
    await seedLead(huntId, { name: "Con Instagram", website: "https://instagram.com/clinica" });
    const ok = await seedLead(huntId, { name: "Normal", website: "https://normal-apify.test" });
    const apify = fakeApify({ usd: 0, fail: true });
    const r = await enrichHunt(db, huntId, { fetch: fakeSites().adapter, apify: apify.adapter, useApify: true });
    const sent = apify.calls.flat();
    expect(sent.every((u) => !/google\.|instagram\./.test(u))).toBe(true);
    expect(sent).toEqual(["https://normal-apify.test/"]);
    expect(r.notas.some((n) => n.includes("Apify falló"))).toBe(true);
    const cps = await db.select().from(contactPoints).where(eq(contactPoints.companyId, ok.companyId));
    expect(cps.some((c) => c.type === "whatsapp")).toBe(true); // from the direct fetch
  });

  it("does not hit Apify at all when useApify is false", async () => {
    const huntId = await seedHunt();
    await seedLead(huntId, { name: "Solo directo", website: "https://directo.test" });
    const apify = fakeApify();
    await enrichHunt(db, huntId, { fetch: fakeSites().adapter, apify: apify.adapter });
    expect(apify.calls).toHaveLength(0);
  });
});

describe("Contact Details Scraper contract", () => {
  it("builds the documented input and maps originalStartUrl rows", () => {
    const input = buildActorInput(["https://a.co/", "https://b.co/"]);
    expect(input).toMatchObject({ startUrls: [{ url: "https://a.co/" }, { url: "https://b.co/" }], sameDomain: true, mergeContacts: true, maxRequestsPerStartUrl: 4, maximumLeadsEnrichmentRecords: 0 });
    expect(input.scrapeSocialMediaProfiles).toEqual({ facebooks: false, instagrams: false, youtubes: false, tiktoks: false, twitters: false });
    expect(toContactItem({ originalStartUrl: "https://a.co/", domain: "a.co", emails: ["info@a.co"], phones: ["1"], phonesUncertain: ["2"], whatsapps: ["3"], linkedIns: ["x"] })).toEqual({ url: "https://a.co/", emails: ["info@a.co"], phones: ["1", "2"], whatsapps: ["3"] });
  });

  it("defaults the actor id, honours waitSecs and sends no social/maps URL to the API", async () => {
    const calls: string[] = [];
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
    const f = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("/acts/")) return json({ data: { id: "r", status: "SUCCEEDED", defaultDatasetId: "d", usageTotalUsd: 0.01 } });
      return json([{ originalStartUrl: "https://a.co/", emails: [], phones: [], whatsapps: [] }]);
    }) as unknown as typeof fetch;
    const apify = createRealApify({ token: "t", actorId: "", fetchImpl: f });
    await apify.scrapeContacts(["https://a.co"], { waitSecs: 10 });
    expect(calls[0]).toContain("/acts/vdrmota~contact-info-scraper/runs?waitForFinish=10");
    await expect(apify.scrapeContacts(["https://maps.google.com/?cid=1"])).rejects.toThrow();
    expect(calls).toHaveLength(2);
  });
});

describe("website discovery (web search)", () => {
  it("keeps only a site whose domain carries a word of the company name, never directories or social networks", async () => {
    const { pickCompanyWebsite, nameTokens } = await import("@/features/enrichment/discover");
    expect(nameTokens("180 GRADOS CONSULTORIAS BOGOTA S.A.S")).toEqual(["grados", "consultorias"]);
    expect(pickCompanyWebsite("180 GRADOS CONSULTORIAS S.A.S", ["https://www.facebook.com/180grados", "https://www.einforma.co/x", "https://180gradosconsultorias.com/contacto"])).toBe("https://180gradosconsultorias.com");
    expect(pickCompanyWebsite("2MC CONSULTORES SAS", ["https://www.rues.org.co/x", "https://otraempresa.com"])).toBeNull();
    expect(pickCompanyWebsite("Contadores Unidos Ltda", ["https://maps.google.com/?q=contadores", "https://www.linkedin.com/company/contadores-unidos"])).toBeNull();
  });

  it("searches the best-scored companies without site or mailbox, stores the found site, records the cost and moves on", async () => {
    const huntId = await seedHunt();
    const a = await seedLead(huntId, { name: "Contadores Unidos SAS" });
    const b = await seedLead(huntId, { name: "Zeta Asesores Ltda" });
    await db.update(companies).set({ isLegalEntity: true }).where(inArray(companies.id, [a.companyId, b.companyId]));
    const queries: string[] = [];
    const apify: ApifyAdapter = {
      isMock: false,
      scrapeContacts: async () => ({ items: [], runId: "r", usageTotalUsd: 0, latencyMs: 0, isMock: false }),
      findWebsites: async (qs) => {
        queries.push(...qs.map((q) => q.q));
        return {
          results: qs.map((q) => ({ key: q.key, urls: q.key === a.companyId ? ["https://www.facebook.com/x", "https://contadoresunidos.com.co/"] : ["https://directorio.test/zeta"] })),
          runId: "search-1",
          usageTotalUsd: 0.02,
          latencyMs: 5,
          isMock: false,
        };
      },
    };
    const sites = fakeSites();
    const first = await enrichHunt(db, huntId, { fetch: sites.adapter, apify, useApify: true });
    expect(first).toMatchObject({ discovering: true, sitiosBuscados: 2, sitiosEncontrados: 1, costoApifyUsd: 0.02, done: false });
    expect(queries[0]).toContain("Bogota");
    const [ca] = await db.select({ website: companies.website }).from(companies).where(eq(companies.id, a.companyId));
    expect(ca!.website).toBe("https://contadoresunidos.com.co");
    // Second call: nobody left to search -> the regular enrichment reads the found site.
    const second = await enrichHunt(db, huntId, { fetch: sites.adapter, apify, useApify: true });
    expect(second.discovering).toBe(false);
    expect(second.total).toBe(1);
  });
});
