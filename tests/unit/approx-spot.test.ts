import { describe, expect, it } from "vitest";
import { toFeatureCollection } from "@/features/hunts/geojson";
import { approxSpot } from "@/features/hunts/service";

const cities = [
  { name: "Bogota", bbox: [4.45, -74.25, 4.84, -73.99] },
  { name: "Medellin", bbox: [6.17, -75.7, 6.37, -75.5] },
];

describe("approximate spot for leads without coordinates", () => {
  it("is deterministic, inside the company's city area and null without areas", () => {
    const a = approxSpot("lead-1", "MEDELLIN PARA ANTIOQUIA", cities)!;
    expect(approxSpot("lead-1", "MEDELLIN PARA ANTIOQUIA", cities)).toEqual(a);
    expect(a.lat).toBeGreaterThan(6.17);
    expect(a.lat).toBeLessThan(6.37);
    expect(a.lng).toBeGreaterThan(-75.7);
    expect(a.lng).toBeLessThan(-75.5);
    const b = approxSpot("lead-2", "Bogotá D.C.", cities)!;
    expect(b.lat).toBeGreaterThan(4.45);
    expect(b.lat).toBeLessThan(4.84);
    expect(approxSpot("lead-1", "Bogota", [])).toBeNull();
  });

  it("is drawn on the map flagged as approximate, real coordinates win", () => {
    const fc = toFeatureCollection([
      { id: "a", lat: null, lng: null, approx: { lat: 4.6, lng: -74.1 }, status: "found", source: "rues", name: "X", score: 50 },
      { id: "b", lat: 4.7, lng: -74.05, approx: null, status: "fit", source: "osm", name: "Y", score: 80 },
      { id: "c", lat: null, lng: null, status: "found", source: "rues", name: "Z", score: 40 },
    ]);
    expect(fc.features.map((f) => [f.id, f.properties.approx])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });
});
