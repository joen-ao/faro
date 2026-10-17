import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import {
  getOverpass,
  normalizePhone,
  persistOverpassResults,
  buildOverpassQuery,
  parseTagFilters,
  queryFromCriteria,
  type ApiCallRecord,
} from "@/integrations/overpass";
import { createMockOverpass } from "@/integrations/overpass/mock";
import { createRealOverpass, toSourceCompanies } from "@/integrations/overpass/real";
import { parseEnv } from "@/lib/env";
import { createTestDb } from "../helpers/test-db";

const elements = [
  { type: "node", id: 123, lat: 4.6, lon: -74.1, tags: { name: "Clinica Uno", phone: "+57 310 123 4567", email: "Info@Uno.co", website: "https://uno.co", "addr:city": "Bogotá", operator: "Persona X" } },
  { type: "way", id: 456, center: { lat: 4.7, lon: -74.0 }, tags: { name: "Dental Dos", "contact:phone": "(1) 234 5678" } },
  { type: "node", id: 789, lat: 4.8, lon: -74.0, tags: { amenity: "dentist" } },
];
const body = JSON.stringify({ elements });
const query = { tags: [{ amenity: "dentist" }], bbox: { south: 0, west: 0, north: 1, east: 1 } };
const ok = () => new Response(body, { status: 200 });
const noSleep = async () => {};

describe("normalizePhone", () => {
  it.each([
    ["+57 310 123 4567", "CO", "+573101234567"],
    ["310 123 4567", "CO", "+573101234567"],
    ["+57 601 234 5678", "CO", "+576012345678"],
    ["+57 1 234 5678", "CO", "+576012345678"],
    ["(1) 2345678", "CO", "+576012345678"],
    ["0057 3101234567", "CO", "+573101234567"],
    ["3101234567; 6012345678", "CO", "+573101234567"],
    ["+1 305 555 0100", "US", "+13055550100"],
    ["(305) 555-0100", "US", "+13055550100"],
    ["+34 91 123 45 67", "CO", "+34911234567"],
  ])("%s -> %s", (raw, country, expected) => {
    expect(normalizePhone(raw, country)).toBe(expected);
  });

  it.each([undefined, "", "abc", "12345", "+57 000 000 0000", "+57 12345", "+1 055 555 0100", "2345678"])("rejects %s", (raw) => {
    expect(normalizePhone(raw)).toBeUndefined();
  });
});

describe("query construction", () => {
  it("parses tag strings, with key-exists filters", () => {
    expect(parseTagFilters(["amenity=dentist", " shop ", "cuisine=*"])).toEqual([{ amenity: "dentist" }, { shop: "*" }, { cuisine: "*" }]);
    const q = buildOverpassQuery({ tags: [{ shop: "*" }], bbox: query.bbox });
    expect(q).toContain('node["shop"](0,0,1,1);');
  });

  it("resolves known cities to a bbox and unknown ones to a named area", () => {
    expect(buildOverpassQuery({ tags: [{ amenity: "dentist" }], city: "Bogotá" })).toContain("(4.45,-74.25,4.84,-73.99)");
    const q = buildOverpassQuery({ tags: [{ amenity: "dentist" }], city: 'Pop"ayán' });
    expect(q).toContain('area["name"="Pop\\"ayán"]');
    expect(q).toContain('way["amenity"="dentist"](area.a);');
  });

  it("builds from criteria and rejects incomplete criteria", () => {
    expect(queryFromCriteria({ tags: ["amenity=dentist"], city: "Cali" }, 30)).toMatchObject({ timeoutSec: 30, city: "Cali" });
    expect(() => queryFromCriteria({ city: "Cali" })).toThrow(/tag/);
    expect(() => queryFromCriteria({ tags: ["shop"] })).toThrow(/bbox or a city/);
    expect(() => buildOverpassQuery({ tags: [{ shop: "*" }] })).toThrow();
  });
});

describe("normalization", () => {
  it("maps nodes and ways to SourceCompany with license and URL, dropping unnamed and personal tags", () => {
    const r = toSourceCompanies(
      [
        { id: "node/123", name: "Clinica Uno", lat: 4.6, lng: -74.1, phone: "+57 310 123 4567", email: "Info@Uno.co", website: "https://uno.co", tags: { operator: "Persona X", "addr:city": "Bogotá" } },
        { id: "way/456", name: "Dental Dos", tags: {} },
        { id: "node/789", tags: {} },
      ],
      { city: "Bogotá" },
    );
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      externalId: "osm:node/123",
      sourceUrl: "https://www.openstreetmap.org/node/123",
      license: "ODbL 1.0 © OpenStreetMap contributors",
      phone: "+573101234567",
      email: "info@uno.co",
      city: "Bogotá",
      isMock: false,
    });
    expect(JSON.stringify(r[0].raw)).not.toContain("Persona X");
    expect(r[1].sourceUrl).toBe("https://www.openstreetmap.org/way/456");
  });

  it("mock adapter yields flagged companies from the fixture", async () => {
    const r = await createMockOverpass().search(query);
    expect(r.companies.length).toBeGreaterThan(5);
    expect(r.companies.every((c) => c.isMock)).toBe(true);
    expect(r.companies[0].externalId).toMatch(/^osm:(node|way)\/\d+$/);
  });

  it("getOverpass honours OVERPASS_MODE", async () => {
    expect((await getOverpass(parseEnv({ OVERPASS_MODE: "mock" })).search(query)).isMock).toBe(true);
    expect(getOverpass(parseEnv({ OVERPASS_MODE: "real" }))).toBeDefined();
  });
});

describe("real adapter", () => {
  it("sends User-Agent and form body, normalizes, and logs the call with cost 0", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const calls: ApiCallRecord[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      return ok();
    }) as unknown as typeof fetch;
    const adapter = createRealOverpass({ fetchImpl, sleep: noSleep, minIntervalMs: 0, onApiCall: (c) => void calls.push(c) });
    const r = await adapter.search({ ...query, city: "Bogotá" });
    expect(r.companies).toHaveLength(2);
    expect(r.companies[1].phone).toBe("+576012345678");
    expect((seen[0].init?.headers as Record<string, string>)["User-Agent"]).toMatch(/^Faro-/);
    expect(String(seen[0].init?.body)).toMatch(/^data=/);
    expect(calls).toEqual([expect.objectContaining({ service: "overpass", status: 200, error: null, costUsd: 0, isMock: false })]);
  });

  it("serves repeated searches from disk cache and refetches after the TTL", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ovp-"));
    try {
      let n = 0;
      let clock = 1_000_000;
      const fetchImpl = (async () => {
        n++;
        return ok();
      }) as unknown as typeof fetch;
      const adapter = createRealOverpass({ fetchImpl, sleep: noSleep, minIntervalMs: 0, cacheDir: dir, cacheTtlMs: 1000, now: () => clock });
      expect((await adapter.search(query)).fromCache).toBe(false);
      const second = await adapter.search(query);
      expect(second.fromCache).toBe(true);
      expect(second.companies).toHaveLength(2);
      expect(n).toBe(1);
      clock += 5000;
      expect((await adapter.search(query)).fromCache).toBe(false);
      expect(n).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("retries with backoff, falls back to the mirror, and logs each failed endpoint", async () => {
    const sleeps: number[] = [];
    const calls: ApiCallRecord[] = [];
    let primary = 0;
    const fetchImpl = (async (url: string) => {
      if (url.includes("overpass-api.de")) {
        primary++;
        return new Response("busy", { status: 429 });
      }
      return ok();
    }) as unknown as typeof fetch;
    const adapter = createRealOverpass({ fetchImpl, sleep: async (ms) => void sleeps.push(ms), minIntervalMs: 0, backoffMs: 10, onApiCall: (c) => void calls.push(c) });
    const r = await adapter.search(query);
    expect(primary).toBe(3);
    expect(sleeps).toEqual([10, 20]);
    expect(r.endpoint).toContain("kumi");
    expect(calls.map((c) => c.status)).toEqual([429, 200]);
    expect(calls[0].error).toMatch(/429/);
  });

  it("throws when every endpoint fails and a logger error does not break the search", async () => {
    const fetchImpl = (async () => new Response("no", { status: 400 })) as unknown as typeof fetch;
    const adapter = createRealOverpass({
      fetchImpl,
      sleep: noSleep,
      minIntervalMs: 0,
      onApiCall: () => {
        throw new Error("db down");
      },
    });
    await expect(adapter.search(query)).rejects.toThrow(/failed on all endpoints/);
  });

  it("never runs two requests at once and respects the minimum interval", async () => {
    let active = 0;
    let maxActive = 0;
    const fetchImpl = (async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return ok();
    }) as unknown as typeof fetch;
    const waits: number[] = [];
    const adapter = createRealOverpass({ fetchImpl, minIntervalMs: 50, sleep: async (ms) => void waits.push(ms) });
    await Promise.all([adapter.search(query), adapter.search({ ...query, tags: [{ shop: "*" }] }), adapter.search({ ...query, city: "Cali", bbox: undefined })]);
    expect(maxActive).toBe(1);
    expect(waits.length).toBeGreaterThanOrEqual(1);
  });
});

describe("persistOverpassResults", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let huntId: string;
  beforeAll(async () => {
    conn = await createTestDb();
    const [w] = await conn.db.insert(s.workspaces).values({ name: "W" }).returning();
    const [icp] = await conn.db.insert(s.icpProfiles).values({ workspaceId: w.id, prompt: "dentistas" }).returning();
    const [h] = await conn.db.insert(s.hunts).values({ icpProfileId: icp.id }).returning();
    huntId = h.id;
  });
  afterAll(() => conn.close());

  it("stores companies + sources with license and URL, idempotently, and flags mock rows", async () => {
    const real = toSourceCompanies([{ id: "node/123", name: "Clínica Uno S.A.S.", lat: 4.6, lng: -74.1, phone: "3101234567", tags: {} }], { city: "Bogotá" });
    const first = await persistOverpassResults(conn.db, huntId, real);
    expect(first).toEqual({ found: 1, inserted: 1, skipped: 0 });
    expect(await persistOverpassResults(conn.db, huntId, real)).toEqual({ found: 1, inserted: 0, skipped: 1 });

    const [src] = await conn.db.select().from(s.companySources).where(eq(s.companySources.externalId, "osm:node/123"));
    expect(src).toMatchObject({ sourceChannel: "osm", license: "ODbL 1.0 © OpenStreetMap contributors", sourceUrl: "https://www.openstreetmap.org/node/123", isMock: false });
    expect((src.raw as { phone_e164: string }).phone_e164).toBe("+573101234567");
    const [co] = await conn.db.select().from(s.companies).where(eq(s.companies.id, src.companyId));
    expect(co).toMatchObject({ name: "Clínica Uno S.A.S.", isDemo: false, city: "Bogotá" });

    const mock = (await createMockOverpass().search(query)).companies;
    await persistOverpassResults(conn.db, huntId, mock);
    const flagged = await conn.db.select().from(s.companySources).where(eq(s.companySources.isMock, true));
    expect(flagged).toHaveLength(mock.length);
    const [hunt] = await conn.db.select().from(s.hunts).where(eq(s.hunts.id, huntId));
    expect((hunt.progress as { osm: { inserted: number } }).osm.inserted).toBe(mock.length);
  });
});
