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
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await conn.close();
});

const H = { "x-app-key": "k-test" };
const json = (body: unknown, headers: Record<string, string> = H) =>
  new Request("http://x/api/ads/spend", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("/api/ads/spend", () => {
  it("requires app access", async () => {
    const { GET, POST } = await import("@/app/api/ads/spend/route");
    expect((await GET(new Request("http://x/api/ads/spend"))).status).toBe(401);
    expect((await POST(json({}, {}))).status).toBe(401);
    const csv = await import("@/app/api/ads/spend/csv/route");
    expect((await csv.POST(new Request("http://x/api/ads/spend/csv", { method: "POST", body: "a" }))).status).toBe(401);
  });

  it("saves a manual row, validates input and lists it", async () => {
    const { GET, POST } = await import("@/app/api/ads/spend/route");
    const ok = await POST(json({ campaign: "c1", date: "2026-10-01", usd: 5.5, impressions: 100, clicks: 4 }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, saved: 1, campaigns: ["c1"] });
    expect((await POST(json({ campaign: "=x", date: "2026-10-01", usd: 1 }))).status).toBe(400);
    expect((await POST(json({ campaign: "c1", date: "2026-10-01", usd: -1 }))).status).toBe(400);
    const list = await (await GET(new Request("http://x/api/ads/spend", { headers: H }))).json();
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toMatchObject({ campaign: "c1", usd: 5.5, isDemo: false });
  });

  it("uploads CSV (raw and multipart), reports row errors and caps at 1 MB", async () => {
    const { POST } = await import("@/app/api/ads/spend/csv/route");
    const csv = "campaign,date,usd\nc2,2026-10-01,3\n=cmd,2026-10-01,3\n";
    const raw = await POST(new Request("http://x/api/ads/spend/csv", { method: "POST", headers: { ...H, "content-type": "text/csv" }, body: csv }));
    expect(raw.status).toBe(200);
    expect(await raw.json()).toMatchObject({ ok: false, saved: 1, errors: [{ line: 3 }] });

    const fd = new FormData();
    fd.set("file", new File(["campaign,date,usd\nc3,2026-10-02,4\n"], "s.csv", { type: "text/csv" }));
    const multi = await POST(new Request("http://x/api/ads/spend/csv", { method: "POST", headers: H, body: fd }));
    expect(await multi.json()).toMatchObject({ ok: true, saved: 1, errors: [] });

    const bad = await POST(new Request("http://x/api/ads/spend/csv", { method: "POST", headers: H, body: "foo\n1" }));
    expect(bad.status).toBe(400);

    const big = "campaign,date,usd\n" + "c,2026-10-01,1\n".repeat(80_000);
    const tooBig = await POST(new Request("http://x/api/ads/spend/csv", { method: "POST", headers: H, body: big }));
    expect(tooBig.status).toBe(413);
  });
});
