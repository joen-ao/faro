import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
vi.mock("@/db/client", async (orig) => {
  const real = await orig<typeof import("@/db/client")>();
  return { ...real, getReadyDb: async () => conn.db };
});
beforeAll(async () => {
  conn = await createTestDb();
  vi.stubEnv("APP_ACCESS_KEY", "k-test");
  vi.stubEnv("META_ADS_MODE", "mock");
  vi.stubEnv("ANTHROPIC_MODE", "mock");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await conn.close();
});

const H = { "x-app-key": "k-test", "content-type": "application/json" };
const post = (url: string, body: unknown, headers: Record<string, string> = H) => new Request(`http://x${url}`, { method: "POST", headers, body: JSON.stringify(body) });
const brief = { serviceId: "agentes-ia", url: "https://www.mokub.co/", dailyBudget: 40000, audience: "Pymes de servicios en Bogotá", count: 3 };

describe("F29 copilot endpoints", () => {
  it("require the app key", async () => {
    const propose = await import("@/app/api/ads/copilot/propose/route");
    const campaigns = await import("@/app/api/ads/copilot/campaigns/route");
    const perf = await import("@/app/api/ads/copilot/performance/route");
    expect((await propose.POST(post("/p", { brief }, {}))).status).toBe(401);
    expect((await campaigns.POST(post("/c", {}, {}))).status).toBe(401);
    expect((await perf.GET(new Request("http://x/perf"))).status).toBe(401);
  });

  it("proposes mock variants, then creates them paused; rejects unknown services and bad destinations", async () => {
    const propose = await import("@/app/api/ads/copilot/propose/route");
    const campaigns = await import("@/app/api/ads/copilot/campaigns/route");
    expect((await propose.POST(post("/p", { brief: { ...brief, serviceId: "no-existe" } }))).status).toBe(400);
    expect((await propose.POST(post("/p", { brief: { ...brief, url: "https://evil.com" } }))).status).toBe(400);

    const res = await propose.POST(post("/p", { brief }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ ok: true, mock: true });
    expect(data.variants).toHaveLength(3);

    const variants = data.variants.map((v: Record<string, unknown>) => ({ ...v, issues: undefined }));
    const created = await campaigns.POST(post("/c", { name: "Mokub prueba IA", brief, variants }));
    expect(created.status).toBe(200);
    expect((await created.json()).created.ads).toHaveLength(3);

    const blocked = await campaigns.POST(post("/c", { name: "Mokub prueba IA", brief, variants: [{ ...variants[0], primaryText: "Resultados garantizados en tu pyme desde la primera semana." }] }));
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).error).toBe("lint");
  });

  it("returns per-ad performance", async () => {
    const perf = await import("@/app/api/ads/copilot/performance/route");
    const res = await perf.GET(new Request("http://x/perf?days=30", { headers: H }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("phase B endpoints require the key and validate input", async () => {
    const evaluate = await import("@/app/api/ads/copilot/evaluate/route");
    const settings = await import("@/app/api/ads/copilot/settings/route");
    const panic = await import("@/app/api/ads/copilot/panic/route");
    const rec = await import("@/app/api/ads/copilot/recommendations/[id]/route");
    const revert = await import("@/app/api/ads/copilot/actions/[id]/revert/route");
    const id = "00000000-0000-4000-8000-000000000000";
    const ctx = (x: string) => ({ params: Promise.resolve({ id: x }) });
    expect((await evaluate.POST(post("/e", {}, {}))).status).toBe(401);
    expect((await settings.POST(post("/s", { mode: "autopilot" }, {}))).status).toBe(401);
    expect((await panic.POST(post("/p", {}, {}))).status).toBe(401);
    expect((await rec.POST(post("/r", { decision: "apply" }, {}), ctx(id))).status).toBe(401);
    expect((await revert.POST(post("/v", {}, {}), ctx(id))).status).toBe(401);

    expect((await settings.POST(post("/s", { mode: "yolo" }))).status).toBe(400);
    const saved = await settings.POST(post("/s", { mode: "autopilot", cplCap: "25000", cpqlCap: "" }));
    expect(await saved.json()).toMatchObject({ ok: true, settings: { mode: "autopilot", cplCap: 25000, cpqlCap: null } });
    expect((await evaluate.POST(post("/e", {}))).status).toBe(200);
    expect((await panic.POST(post("/p", {}))).status).toBe(200);
    expect((await rec.POST(post("/r", { decision: "apply" }), ctx("not-a-uuid"))).status).toBe(400);
    expect((await rec.POST(post("/r", { decision: "apply" }), ctx(id))).status).toBe(409);
    expect((await revert.POST(post("/v", {}), ctx(id))).status).toBe(409);
  });

  it("learnings endpoint requires the key and runs in mock", async () => {
    const learn = await import("@/app/api/ads/copilot/learnings/route");
    expect((await learn.POST(post("/l", {}, {}))).status).toBe(401);
    const res = await learn.POST(post("/l", {}));
    expect(res.status).toBe(200);
    expect((await res.json()).result).toMatchObject({ isMock: true });
  });
});
