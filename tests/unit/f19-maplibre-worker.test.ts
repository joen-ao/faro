import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("MapLibre worker asset", () => {
  it("public/maplibre-gl-worker.mjs is the exact worker shipped by the installed maplibre-gl", () => {
    const a = readFileSync(path.join(process.cwd(), "public/maplibre-gl-worker.mjs"));
    const b = readFileSync(path.join(process.cwd(), "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"));
    // If this fails after upgrading maplibre-gl: cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs public/
    expect(a.equals(b)).toBe(true);
  });
});
