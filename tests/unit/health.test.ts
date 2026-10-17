import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns modes without secrets", async () => {
    const res = GET();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.sendEnabled).toBe(false);
    expect(Object.keys(body.modes).sort()).toEqual(["anthropic", "apify", "email", "google_places", "overpass", "socrata"]);
    expect(JSON.stringify(body)).not.toMatch(/key|token|secret/i);
  });
});
