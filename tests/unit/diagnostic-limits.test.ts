import { describe, expect, it } from "vitest";
import { parseContact } from "@/features/diagnostic/contact";
import { createLimiter, demoToolsEnabled, MAX_BODY_BYTES, readJsonCapped } from "@/features/diagnostic/limits";

describe("limits", () => {
  it("rate limits per key inside a window and resets after it", () => {
    const l = createLimiter(5, 1000);
    const ok = Array.from({ length: 6 }, () => l.allow("ip|slug", 0));
    expect(ok).toEqual([true, true, true, true, true, false]);
    expect(l.allow("other|slug", 0)).toBe(true);
    expect(l.allow("ip|slug", 1001)).toBe(true);
  });
  it("caps the JSON body at 16 KB", async () => {
    const mk = (body: string) => new Request("http://x/api", { method: "POST", body });
    expect(await readJsonCapped(mk(JSON.stringify({ a: 1 })))).toEqual({ ok: true, json: { a: 1 } });
    expect(await readJsonCapped(mk("x".repeat(MAX_BODY_BYTES + 1)))).toEqual({ ok: false, error: "too_large" });
    expect(await readJsonCapped(mk("{bad"))).toEqual({ ok: false, error: "bad_json" });
  });
  it("demo tools are off in production unless the e2e flag is set", () => {
    expect(demoToolsEnabled({ FARO_SEED_DEMO: "1", NODE_ENV: "production" })).toBe(false);
    expect(demoToolsEnabled({ FARO_SEED_DEMO: "1", NODE_ENV: "production", FARO_E2E: "1" })).toBe(true);
    expect(demoToolsEnabled({ FARO_SEED_DEMO: "1", NODE_ENV: "development" })).toBe(true);
    expect(demoToolsEnabled({ NODE_ENV: "development" })).toBe(false);
  });
  it("contact message is capped at 500 chars", () => {
    const base = { slug: "demo-clinica", company: "Clínica X SAS", email: "info@x.co", consent: true };
    expect(parseContact({ ...base, message: "x".repeat(501) }).kind).toBe("invalid");
    expect(parseContact({ ...base, message: "x".repeat(500) }).kind).toBe("ok");
  });
});
