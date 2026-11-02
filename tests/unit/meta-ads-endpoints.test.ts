import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
vi.mock("@/db/client", async (orig) => {
  const real = await orig<typeof import("@/db/client")>();
  return { ...real, getReadyDb: async () => conn.db };
});
// The env is cached per module graph; each test re-imports routes after resetting modules.
beforeAll(async () => {
  conn = await createTestDb();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await conn.close();
});

const H = { "x-app-key": "k-test", "content-type": "application/json" };
const post = (url: string, body: unknown, headers: Record<string, string> = H) => new Request(`http://x${url}`, { method: "POST", headers, body: JSON.stringify(body) });

async function load(extra: Record<string, string> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("APP_ACCESS_KEY", "k-test");
  vi.stubEnv("META_ADS_MODE", "mock");
  vi.stubEnv("CRON_SECRET", "cron-s");
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
  return {
    campaigns: await import("@/app/api/ads/meta/campaigns/route"),
    status: await import("@/app/api/ads/meta/campaigns/[id]/status/route"),
    sync: await import("@/app/api/ads/meta/sync/route"),
    cron: await import("@/app/api/cron/meta-ads-sync/route"),
  };
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const campaign = { name: "Mokub web", url: "https://www.mokub.co/", dailyBudget: 20000, primaryText: "Texto", headline: "Título" };

describe("F28 endpoints", () => {
  it("require the app key; the cron requires CRON_SECRET", async () => {
    const r = await load();
    expect((await r.campaigns.GET(new Request("http://x/api/ads/meta/campaigns"))).status).toBe(401);
    expect((await r.campaigns.POST(post("/api/ads/meta/campaigns", campaign, {}))).status).toBe(401);
    expect((await r.sync.POST(new Request("http://x/api/ads/meta/sync", { method: "POST" }))).status).toBe(401);
    expect((await r.status.POST(post("/api/ads/meta/campaigns/1/status", { status: "PAUSED" }, {}), ctx("900000000000001"))).status).toBe(401);
    expect((await r.cron.GET(new Request("http://x/api/cron/meta-ads-sync"))).status).toBe(401);
    const ok = await r.cron.GET(new Request("http://x/api/cron/meta-ads-sync", { headers: { authorization: "Bearer cron-s" } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).summary).toMatchObject({ mode: "mock", saved: 0 });
  });

  it("creates campaigns paused and rejects bad destinations", async () => {
    const r = await load();
    const res = await r.campaigns.POST(post("/api/ads/meta/campaigns", campaign));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ ok: true, mock: true });
    expect(new URL(data.created.link).searchParams.get("utm_campaign")).toBe(data.created.campaignId);
    expect((await r.campaigns.POST(post("/api/ads/meta/campaigns", { ...campaign, url: "https://evil.com/" }))).status).toBe(400);
    expect((await r.campaigns.POST(post("/api/ads/meta/campaigns", { ...campaign, url: "http://www.mokub.co/" }))).status).toBe(400);
  });

  it("pauses freely but locks activation behind ADS_SPEND_ENABLED + typed name", async () => {
    let r = await load();
    const id = "900000000000001"; // mock campaign "DEMO · Mokub sitio web"
    expect((await r.status.POST(post(`/x`, { status: "PAUSED" }), ctx(id))).status).toBe(200);
    const locked = await r.status.POST(post(`/x`, { status: "ACTIVE", confirmName: "DEMO · Mokub sitio web" }), ctx(id));
    expect(locked.status).toBe(409);
    expect((await locked.json()).error).toBe("spend_disabled");

    r = await load({ ADS_SPEND_ENABLED: "true" });
    expect((await r.status.POST(post(`/x`, { status: "ACTIVE", confirmName: "otra" }), ctx(id))).status).toBe(400);
    expect((await r.status.POST(post(`/x`, { status: "ACTIVE", confirmName: "DEMO · Mokub sitio web" }), ctx(id))).status).toBe(200);
    expect((await r.status.POST(post(`/x`, { status: "ACTIVE" }), ctx("act_1"))).status).toBe(400);
  });
});
