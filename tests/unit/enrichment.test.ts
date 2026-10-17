import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { apiCalls, companies, companySources, contactPoints, costEntries, leads } from "@/db/schema";
import { parseEnv } from "@/lib/env";
import { UnsafeUrlError } from "@/lib/ssrf";
import { assertSafePushUrl } from "@/integrations/dapta/ssrf";
import { assertScrapableUrl, BlockedUrlError, createMockApify, createRealApify, getApify, isGoogleMapsUrl, ApifyError } from "@/integrations/apify";
import { createMockWebsiteFetch, createRealWebsiteFetch } from "@/integrations/website-fetch";
import { enrichCompany, EnrichInputError, handleLeadEnrich } from "@/features/enrichment";
import { prorateSharedCost } from "@/features/metrics/costs";
import { createTestDb } from "../helpers/test-db";

describe("apify guard", () => {
  it("blocks Google Maps URLs in every shape", () => {
    for (const u of [
      "https://www.google.com/maps/place/Clinica",
      "https://google.com.co/maps?q=dentista",
      "https://maps.google.com/?cid=123",
      "https://goo.gl/maps/abc",
      "https://maps.app.goo.gl/xyz",
      "www.google.com/maps/search/dental",
    ]) {
      expect(isGoogleMapsUrl(u), u).toBe(true);
      expect(() => assertScrapableUrl(u), u).toThrow(BlockedUrlError);
    }
    expect(isGoogleMapsUrl("https://clinica.co/mapa")).toBe(false);
  });
  it("blocks social networks and private targets, accepts public sites", () => {
    expect(() => assertScrapableUrl("https://www.instagram.com/clinica")).toThrow(BlockedUrlError);
    expect(() => assertScrapableUrl("https://facebook.com/clinica")).toThrow(BlockedUrlError);
    expect(() => assertScrapableUrl("http://169.254.169.254/")).toThrow(UnsafeUrlError);
    expect(assertScrapableUrl("clinica.co")).toBe("https://clinica.co/");
  });
  it("real adapter refuses Google Maps before any network call", async () => {
    const f = vi.fn();
    const apify = createRealApify({ token: "t", actorId: "a", fetchImpl: f as unknown as typeof fetch });
    await expect(apify.scrapeContacts(["https://www.google.com/maps/place/x"])).rejects.toBeInstanceOf(BlockedUrlError);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("apify real adapter (fake REST)", () => {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
  it("starts a run, polls to completion and reads usageTotalUsd + dataset items", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/acts/")) return json({ data: { id: "run1", status: "RUNNING" } });
      if (url.includes("/actor-runs/run1")) return json({ data: { id: "run1", status: "SUCCEEDED", defaultDatasetId: "ds1", usageTotalUsd: 0.0123 } });
      return json([{ url: "https://clinica.co", emails: ["info@clinica.co"], phones: ["+57 601 555 0101"], phonesUncertain: ["3105550102"], whatsapps: [] }]);
    }) as unknown as typeof fetch;
    const r = await createRealApify({ token: "tok", actorId: "vdrmota/contact-info-scraper", fetchImpl: f }).scrapeContacts(["https://clinica.co"]);
    expect(r).toMatchObject({ runId: "run1", usageTotalUsd: 0.0123, isMock: false });
    expect(r.items[0]).toMatchObject({ emails: ["info@clinica.co"], phones: ["+57 601 555 0101", "3105550102"] });
    expect(calls[0]!.url).toContain("/acts/vdrmota%2Fcontact-info-scraper/runs?waitForFinish=45");
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(calls[0]!.init!.body as string)).toMatchObject({ startUrls: [{ url: "https://clinica.co/" }], sameDomain: true });
  });
  it("fails on HTTP errors and non-succeeded runs", async () => {
    const bad = vi.fn(async () => json({}, 401)) as unknown as typeof fetch;
    await expect(createRealApify({ token: "t", actorId: "a", fetchImpl: bad }).scrapeContacts(["https://c.co"])).rejects.toBeInstanceOf(ApifyError);
    const failed = vi.fn(async () => json({ data: { id: "r", status: "FAILED" } })) as unknown as typeof fetch;
    await expect(createRealApify({ token: "t", actorId: "a", fetchImpl: failed }).scrapeContacts(["https://c.co"])).rejects.toThrow(/FAILED/);
  });
  it("factory uses the mock without token/actor or in mock mode", async () => {
    expect((await getApify(parseEnv({})).scrapeContacts(["https://c.co"])).isMock).toBe(true);
    expect((await getApify(parseEnv({ APIFY_MODE: "real", APIFY_TOKEN: "t" })).scrapeContacts(["https://c.co"])).isMock).toBe(true);
    const mock = await createMockApify().scrapeContacts(["https://a.co", "https://b.co"]);
    expect(mock.usageTotalUsd).toBe(0.004);
  });
  it("dapta ssrf re-export keeps working", () => {
    expect(() => assertSafePushUrl("http://x.test")).toThrow(/https/);
  });
});

describe("enrichCompany", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    conn = await createTestDb();
  });
  afterAll(() => conn.close());

  const HOME = `<html><head><title>Clinica Real</title></head><body><a href="/contacto">Contacto</a>
    <p>info@real.test camila.perez@real.test</p><a href="tel:+576015550123">tel</a></body></html>`;
  const CONTACT = `<form><input type="email" name="email"><textarea name="message"></textarea></form><p>citas@real.test</p>`;
  const siteFetch = () => {
    const routes: Record<string, string | undefined> = {
      "https://real.test/robots.txt": undefined,
      "https://real.test/": HOME,
      "https://real.test/contacto": CONTACT,
    };
    const f = (async (u: string | URL | Request) => {
      const body = routes[String(u)];
      if (String(u).endsWith("robots.txt")) return new Response("", { status: 404 });
      return body ? new Response(body, { status: 200, headers: { "content-type": "text/html" } }) : new Response("", { status: 404, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;
    return createRealWebsiteFetch({ fetchImpl: f, resolve: async () => ["93.184.216.34"], minIntervalMs: 0 });
  };

  async function seed(opts: { website: string | null; isDemo?: boolean; name?: string; withLead?: boolean }) {
    const [c] = await conn.db
      .insert(companies)
      .values({ name: opts.name ?? "Clinica Real", normalizedName: (opts.name ?? "clinica real").toLowerCase(), website: opts.website, isDemo: !!opts.isDemo })
      .returning();
    let leadId: string | undefined;
    if (opts.withLead !== false) {
      const [l] = await conn.db.insert(leads).values({ companyId: c!.id, primarySource: "osm", slug: `s-${c!.id.slice(0, 8)}`, isDemo: !!opts.isDemo }).returning();
      leadId = l!.id;
    }
    return { companyId: c!.id, leadId };
  }

  it("stores website source, generic contacts without duplicates, api_calls; re-run is idempotent", async () => {
    const { companyId } = await seed({ website: "https://real.test/" });
    await conn.db.insert(contactPoints).values({ companyId, type: "email", value: "info@real.test", isGeneric: true, sourceChannel: "osm" });
    const s = await enrichCompany(conn.db, companyId, { fetch: siteFetch() });
    expect(s).toMatchObject({ status: "enriched", isMock: false, discardedPersonalEmails: 1 });
    const cps = await conn.db.select().from(contactPoints).where(eq(contactPoints.companyId, companyId));
    const key = cps.map((c) => `${c.type}:${c.value}`).sort();
    expect(key).toEqual(["email:citas@real.test", "email:info@real.test", "phone:+576015550123", "web_form:https://real.test/contacto"]);
    expect(cps.every((c) => c.isGeneric)).toBe(true);
    expect(s.contactsAdded).toBe(3); // info@ already existed
    const [src] = await conn.db.select().from(companySources).where(and(eq(companySources.companyId, companyId), eq(companySources.sourceChannel, "website")));
    expect(src).toMatchObject({ license: "Sitio web público de la empresa", isMock: false });
    const raw = src!.raw as { websiteText: string; signals: { hasContactForm: boolean } };
    expect(raw.websiteText).toContain("Clinica Real");
    expect(raw.websiteText).not.toContain("camila");
    expect(raw.signals.hasContactForm).toBe(true);
    const calls = await conn.db.select().from(apiCalls).where(eq(apiCalls.service, "website_fetch"));
    expect(calls.length).toBeGreaterThan(0);

    const again = await enrichCompany(conn.db, companyId, { fetch: siteFetch() });
    expect(again.contactsAdded).toBe(0);
    expect(await conn.db.select().from(companySources).where(eq(companySources.companyId, companyId))).toHaveLength(1);
  });

  it("company without website or unknown id", async () => {
    const { companyId } = await seed({ website: null, name: "Sin Web" });
    expect((await enrichCompany(conn.db, companyId, { fetch: siteFetch() })).status).toBe("no_website");
    await expect(enrichCompany(conn.db, "00000000-0000-4000-8000-000000000000", { fetch: siteFetch() })).rejects.toBeInstanceOf(EnrichInputError);
  });

  it("robots disallow yields no_pages and no contacts", async () => {
    const { companyId } = await seed({ website: "https://blocked.test/", name: "Bloqueada" });
    const f = (async (u: string | URL | Request) => new Response(String(u).endsWith("robots.txt") ? "User-agent: *\nDisallow: /" : "x", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    const s = await enrichCompany(conn.db, companyId, { fetch: createRealWebsiteFetch({ fetchImpl: f, resolve: async () => ["93.184.216.34"], minIntervalMs: 0 }) });
    expect(s.status).toBe("no_pages");
    expect(s.skipped[0]!.reason).toBe("robots_disallow");
    expect(await conn.db.select().from(contactPoints).where(eq(contactPoints.companyId, companyId))).toHaveLength(0);
  });

  it("mock output never creates contact_points for a real company, but does for a demo one", async () => {
    const real = await seed({ website: "https://fake-real.example.com", name: "Real Mock" });
    const sr = await enrichCompany(conn.db, real.companyId, { fetch: createMockWebsiteFetch() });
    expect(sr.isMock).toBe(true);
    expect(sr.contactsAdded).toBe(0);
    const [src] = await conn.db.select().from(companySources).where(eq(companySources.companyId, real.companyId));
    expect(src!.isMock).toBe(true);

    const demo = await seed({ website: "https://demo-site.example.com", isDemo: true, name: "Demo Co" });
    const boom = { allows: async () => true, fetchSite: async () => { throw new Error("network must not be used for demo"); } };
    const sd = await enrichCompany(conn.db, demo.companyId, { fetch: boom });
    expect(sd.isMock).toBe(true);
    expect(sd.contactsAdded).toBeGreaterThan(0);
  });

  it("Apify: only when requested; cost prorated over leads (scraping), personal emails dropped", async () => {
    const { companyId, leadId } = await seed({ website: "https://real.test/", name: "Con Apify" });
    await enrichCompany(conn.db, companyId, { fetch: siteFetch(), apify: createMockApify() });
    expect(await conn.db.select().from(costEntries).where(eq(costEntries.leadId, leadId!))).toHaveLength(0);

    const apify = {
      scrapeContacts: async () => ({
        items: [{ url: "https://real.test/", emails: ["ventas@real.test", "juan.garcia@real.test"], phones: ["+57 601 555 0188"], whatsapps: ["573105550177"] }],
        runId: "run42",
        usageTotalUsd: 0.0101,
        latencyMs: 5,
        isMock: false,
      }),
    };
    const s = await enrichCompany(conn.db, companyId, { fetch: siteFetch(), apify, useApify: true });
    expect(s.apify).toMatchObject({ used: true, costUsd: 0.0101, isMock: false });
    const costs = await conn.db.select().from(costEntries).where(eq(costEntries.leadId, leadId!));
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ category: "scraping", sourceChannel: "website", usd: 0.0101, isMock: false, isDemo: false });
    expect(costs[0]!.evidence).toContain("run42");
    const cps = await conn.db.select().from(contactPoints).where(eq(contactPoints.companyId, companyId));
    const vals = cps.map((c) => c.value);
    expect(vals).toEqual(expect.arrayContaining(["ventas@real.test", "+573105550177", "+576015550188"]));
    expect(vals.join()).not.toContain("juan.garcia");
    expect(cps.find((c) => c.type === "whatsapp")!.isGeneric).toBe(false);
  });

  it("Apify mock cost is flagged is_mock/is_demo and mock contacts are not stored for real companies", async () => {
    const { companyId, leadId } = await seed({ website: "https://real.test/", name: "Apify Mock" });
    const s = await enrichCompany(conn.db, companyId, { fetch: siteFetch(), apify: createMockApify(), useApify: true });
    expect(s.apify).toMatchObject({ used: true, isMock: true });
    const [cost] = await conn.db.select().from(costEntries).where(eq(costEntries.leadId, leadId!));
    expect(cost).toMatchObject({ isMock: true, isDemo: true, category: "scraping" });
    const vals = (await conn.db.select().from(contactPoints).where(eq(contactPoints.companyId, companyId))).map((c) => c.value);
    expect(vals).not.toContain("contacto@real.test");
  });

  it("Apify without lead records an unattached cost; blocked URL and robots are reported", async () => {
    const { companyId } = await seed({ website: "https://real.test/", name: "Sin Lead", withLead: false });
    const apify = { scrapeContacts: async () => ({ items: [], runId: "r", usageTotalUsd: 0.5, latencyMs: 1, isMock: false }) };
    await enrichCompany(conn.db, companyId, { fetch: siteFetch(), apify, useApify: true });
    const un = await conn.db.select().from(costEntries).where(eq(costEntries.evidence, "Apify r · usageTotalUsd 0.500000"));
    expect(un).toHaveLength(1);
    expect(un[0]!.leadId).toBeNull();

    const maps = await seed({ website: "https://www.google.com/maps/place/x", name: "Maps Co" });
    const f = { allows: async () => true, fetchSite: createMockWebsiteFetch().fetchSite };
    const sm = await enrichCompany(conn.db, maps.companyId, { fetch: f, apify: createMockApify(), useApify: true });
    expect(sm.apify?.used).toBe(false);
    expect(sm.apify?.note).toMatch(/Google Maps/);

    const noRobots = await seed({ website: "https://real.test/", name: "Robots No" });
    const sr = await enrichCompany(conn.db, noRobots.companyId, { fetch: { ...siteFetch(), allows: async () => false }, apify, useApify: true });
    expect(sr.apify?.note).toMatch(/robots/);

    const failing = { scrapeContacts: async () => { throw new ApifyError("x"); } };
    const sf = await enrichCompany(conn.db, noRobots.companyId, { fetch: siteFetch(), apify: failing, useApify: true });
    expect(sf.apify?.used).toBe(false);
  });

  it("handleLeadEnrich validates input and resolves the lead", async () => {
    const { leadId } = await seed({ website: "https://real.test/", name: "Via Handler" });
    expect((await handleLeadEnrich(conn.db, "no-uuid", {}, { fetch: siteFetch() })).status).toBe(400);
    expect((await handleLeadEnrich(conn.db, leadId!, { apify: "si" }, { fetch: siteFetch() })).status).toBe(400);
    expect((await handleLeadEnrich(conn.db, "00000000-0000-4000-8000-000000000000", {}, { fetch: siteFetch() })).status).toBe(404);
    const ok = await handleLeadEnrich(conn.db, leadId!, undefined, { fetch: siteFetch() });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: "enriched" });
  });
});

describe("apify cost proration", () => {
  it("splits usageTotalUsd exactly across the companies of a run", async () => {
    const conn = await createTestDb();
    try {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const [c] = await conn.db.insert(companies).values({ name: `C${i}`, normalizedName: `c${i}` }).returning();
        const [l] = await conn.db.insert(leads).values({ companyId: c!.id, primarySource: "osm", slug: `p-${i}` }).returning();
        ids.push(l!.id);
      }
      const rows = await prorateSharedCost(conn.db, { sourceChannel: "website", category: "scraping", totalUsd: 0.01, leadIds: ids, evidence: "Apify run" });
      expect(rows.map((r) => r.usd)).toEqual([0.003333, 0.003333, 0.003334]);
      expect(rows.reduce((a, r) => a + r.usd, 0)).toBeCloseTo(0.01, 6);
    } finally {
      await conn.close();
    }
  });
});
