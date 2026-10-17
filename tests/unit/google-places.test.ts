import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { seedCostRates } from "@/db/seed";
import {
  getGooglePlaces,
  PLACES_ENDPOINT,
  PLACES_FIELD_MASK,
  PlacesError,
  buildRequestBody,
  createRealPlaces,
  recordPlacesCost,
  type PlacesApiCall,
} from "@/integrations/google-places";
import { parseEnv } from "@/lib/env";
import { createTestDb } from "../helpers/test-db";

const page1 = {
  places: [
    {
      id: "ABC",
      displayName: { text: "Clínica Dental X" },
      formattedAddress: "Cra 1 # 2-3, Bogotá",
      location: { latitude: 4.6, longitude: -74.1 },
      websiteUri: "https://x.example.com",
      internationalPhoneNumber: "+57 601 555 0101",
      nationalPhoneNumber: "(601) 5550101",
      types: ["dentist"],
      businessStatus: "OPERATIONAL",
    },
    { id: "GONE", displayName: { text: "Cerrada" }, businessStatus: "CLOSED_PERMANENTLY" },
  ],
  nextPageToken: "tok1",
};
const page2 = { places: [{ id: "DEF", displayName: { text: "Otra" }, internationalPhoneNumber: "basura" }], nextPageToken: "tok2" };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("google places real", () => {
  it("sends the exact request and normalises", async () => {
    const f = vi.fn(async () => json({ places: page1.places }));
    const calls: PlacesApiCall[] = [];
    const a = createRealPlaces({ apiKey: "K", fetchImpl: f as unknown as typeof fetch, onApiCall: (c) => void calls.push(c) });
    const r = await a.search({ businessType: "clínica dental", city: "Bogotá", bbox: { south: 4.45, west: -74.25, north: 4.84, east: -73.99 }, pageSize: 5 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(PLACES_ENDPOINT);
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    expect(h["X-Goog-Api-Key"]).toBe("K");
    expect(h["X-Goog-FieldMask"]).toBe(PLACES_FIELD_MASK);
    expect(h["X-Goog-FieldMask"]).not.toContain("reviews");
    expect(h["X-Goog-FieldMask"]).not.toContain("places.nationalPhoneNumber");
    expect(JSON.parse(init.body as string)).toEqual({
      textQuery: "clínica dental Bogotá",
      pageSize: 5,
      locationRestriction: { rectangle: { low: { latitude: 4.45, longitude: -74.25 }, high: { latitude: 4.84, longitude: -73.99 } } },
    });
    expect(r.calls).toBe(1);
    expect(r.companies).toHaveLength(1);
    expect(r.companies[0]).toMatchObject({
      name: "Clínica Dental X",
      externalId: "places:ABC",
      sourceChannel: "google_places",
      sourceUrl: "https://www.google.com/maps/place/?q=place_id:ABC",
      phone: "+576015550101",
      isLegalEntity: true,
      possibleNaturalPerson: false,
      website: "https://x.example.com",
      lat: 4.6,
      isMock: false,
      license: expect.stringContaining("Google Maps Platform"),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ status: 200, error: null, costUsd: 0, isMock: false });
  });

  it("limits pagination to maxPages and sends the page token", async () => {
    const f = vi.fn().mockResolvedValueOnce(json(page1)).mockResolvedValueOnce(json(page2)).mockResolvedValue(json(page2));
    const a = createRealPlaces({ apiKey: "K", fetchImpl: f as unknown as typeof fetch });
    const r = await a.search({ businessType: "dentista", maxPages: 2 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse((f.mock.calls[1][1] as RequestInit).body as string).pageToken).toBe("tok1");
    expect(r.calls).toBe(2);
    expect(r.companies.map((c) => c.externalId)).toEqual(["places:ABC", "places:DEF"]);
    expect(r.companies[1].phone).toBeUndefined();
  });

  it("keeps page 1 results and call count when page 2 fails", async () => {
    const f = vi.fn().mockResolvedValueOnce(json(page1)).mockResolvedValueOnce(json({ error: { message: "quota" } }, 429));
    const r = await createRealPlaces({ apiKey: "K", fetchImpl: f as unknown as typeof fetch }).search({ businessType: "x" });
    expect(r.calls).toBe(1);
    expect(r.companies).toHaveLength(1);
    expect(r.error).toContain("429");
  });

  it("stops when there is no next page token", async () => {
    const f = vi.fn(async () => json({ places: page1.places }));
    const a = createRealPlaces({ apiKey: "K", fetchImpl: f as unknown as typeof fetch, maxPages: 5 });
    await a.search({ businessType: "x" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each([403, 429])("throws PlacesError on %i and logs the failed call", async (status) => {
    const f = vi.fn(async () => json({ error: { message: "denied" } }, status));
    const calls: PlacesApiCall[] = [];
    const a = createRealPlaces({ apiKey: "K", fetchImpl: f as unknown as typeof fetch, onApiCall: (c) => void calls.push(c) });
    const err = await a.search({ businessType: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(PlacesError);
    expect(err.status).toBe(status);
    expect(err.message).toContain("denied");
    expect(f).toHaveBeenCalledTimes(1);
    expect(calls[0]).toMatchObject({ status, error: expect.stringContaining(String(status)) });
  });

  it("wraps network errors and tolerates non-JSON error bodies", async () => {
    const a = createRealPlaces({ apiKey: "K", fetchImpl: (async () => Promise.reject(new Error("boom"))) as unknown as typeof fetch });
    await expect(a.search({ businessType: "x" })).rejects.toBeInstanceOf(PlacesError);
    const b = createRealPlaces({ apiKey: "K", fetchImpl: (async () => new Response("<html>", { status: 500 })) as unknown as typeof fetch });
    await expect(b.search({ businessType: "x" })).rejects.toThrow("500");
  });

  it("validates criteria", () => {
    expect(() => buildRequestBody({ city: "Bogotá" })).toThrow(PlacesError);
    expect(() => buildRequestBody({ businessType: "x", bbox: { south: NaN, west: 0, north: 1, east: 1 } })).toThrow(PlacesError);
    expect(buildRequestBody({ businessType: "x", pageSize: 99 }).pageSize).toBe(20);
  });
});

describe("mode selection", () => {
  it("falls back to mock without a key, even if mode=real", async () => {
    const r = await getGooglePlaces(parseEnv({ GOOGLE_PLACES_MODE: "real" })).search({ businessType: "dentista", city: "Bogotá" });
    expect(r.isMock).toBe(true);
    expect(r.calls).toBe(0);
    expect(r.companies.length).toBeGreaterThan(0);
    expect(r.companies.every((c) => c.isMock && c.externalId.startsWith("places:"))).toBe(true);
  });
  it("mock mode ignores the key; real needs mode=real plus key", async () => {
    expect((await getGooglePlaces(parseEnv({ GOOGLE_PLACES_API_KEY: "K" })).search({ businessType: "x" })).isMock).toBe(true);
    const f = vi.fn(async () => json({ places: [] }));
    const real = getGooglePlaces(parseEnv({ GOOGLE_PLACES_MODE: "real", GOOGLE_PLACES_API_KEY: "K" }), undefined, f as unknown as typeof fetch);
    expect((await real.search({ businessType: "x" })).isMock).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("list cost", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    conn = await createTestDb();
    await seedCostRates(conn.db);
  });
  afterAll(async () => conn.close());

  it("records list value with usd 0, mock flagged", async () => {
    await recordPlacesCost(conn.db, { calls: 0 });
    await recordPlacesCost(conn.db, { calls: 3 });
    await recordPlacesCost(conn.db, { calls: 1, isMock: true });
    const rows = await conn.db.select().from(s.costEntries).where(eq(s.costEntries.sourceChannel, "google_places"));
    expect(rows).toHaveLength(2);
    const real = rows.find((r) => !r.isMock)!;
    expect(real).toMatchObject({ category: "data", quantity: 3, unit: "call", rate: 0.032, usd: 0, isDemo: false });
    expect(real.evidence).toContain("tier gratuito");
    expect(rows.find((r) => r.isMock)).toMatchObject({ isDemo: true, usd: 0 });
  });
});
