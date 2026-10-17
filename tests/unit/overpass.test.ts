import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMockOverpass } from "@/integrations/overpass/mock";
import { buildOverpassQuery, createRealOverpass, parseOverpass } from "@/integrations/overpass/real";
import { getOverpass } from "@/integrations/overpass";
import { parseEnv } from "@/lib/env";

const fixture = JSON.parse(readFileSync("fixtures/overpass-dental-bogota.json", "utf8"));

describe("overpass", () => {
  it("builds a union of node+way per filter with bbox and out center", () => {
    const q = buildOverpassQuery({
      tags: [{ amenity: "dentist" }, { healthcare: "dentist" }],
      bbox: { south: 4.45, west: -74.25, north: 4.84, east: -73.99 },
      timeoutSec: 60,
    });
    expect(q).toContain("[timeout:60]");
    expect(q).toContain('node["amenity"="dentist"](4.45,-74.25,4.84,-73.99);');
    expect(q).toContain('way["healthcare"="dentist"](4.45,-74.25,4.84,-73.99);');
    expect(q.endsWith("out center tags;")).toBe(true);
  });

  it("parses nodes and ways (center), contact tag variants and dedupes", () => {
    const places = parseOverpass({
      elements: [
        { type: "node", id: 1, lat: 4.6, lon: -74.1, tags: { name: "A", "contact:website": "https://a.co", "contact:phone": "+57 1 2" } },
        { type: "way", id: 2, center: { lat: 4.7, lon: -74.0 }, tags: { name: "B", email: "x@b.co", "addr:street": "Calle 1", "addr:housenumber": "2" } },
        { type: "node", id: 1, lat: 4.6, lon: -74.1, tags: {} },
      ],
    });
    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({ id: "node/1", website: "https://a.co", phone: "+57 1 2" });
    expect(places[1]).toMatchObject({ id: "way/2", lat: 4.7, email: "x@b.co", address: "Calle 1 2" });
  });

  it("parses the real fixture", () => {
    const places = parseOverpass(fixture);
    expect(places.length).toBeGreaterThan(5);
    expect(places.every((p) => p.name && p.lat !== undefined)).toBe(true);
    expect(places.some((p) => p.website)).toBe(true);
  });

  it("falls back to the mirror when the primary fails (no network)", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.includes("overpass-api.de")) return new Response("busy", { status: 504 });
      return new Response(JSON.stringify(fixture), { status: 200 });
    }) as unknown as typeof fetch;
    const adapter = createRealOverpass({ fetchImpl, sleep: async () => {}, minIntervalMs: 0 });
    const r = await adapter.search({ tags: [{ amenity: "dentist" }], bbox: { south: 0, west: 0, north: 1, east: 1 } });
    expect(r.endpoint).toContain("kumi.systems");
    expect(r.isMock).toBe(false);
    expect(r.places.length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.includes("overpass-api.de"))).toHaveLength(3);
  });

  it("mock adapter is flagged and selected when OVERPASS_MODE=mock", async () => {
    const r = await createMockOverpass().search({ tags: [], bbox: { south: 0, west: 0, north: 1, east: 1 } });
    expect(r.isMock).toBe(true);
    const adapter = getOverpass(parseEnv({ OVERPASS_MODE: "mock" }));
    expect((await adapter.search({ tags: [], bbox: { south: 0, west: 0, north: 1, east: 1 } })).isMock).toBe(true);
  });
});
