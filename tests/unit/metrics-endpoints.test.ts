import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as s from "@/db/schema";
import { createDb, ensureMigrated, getReadyDb } from "@/db/client";
import { seed } from "@/db/seed";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
let failMigration = false;

vi.mock("@/db/client", async (orig) => {
  const real = await orig<typeof import("@/db/client")>();
  return {
    ...real,
    getReadyDb: async (c?: unknown) => {
      if (c) return real.getReadyDb(c as never);
      if (failMigration) throw new Error("boom");
      return conn.db;
    },
  };
});

beforeAll(async () => {
  conn = await createTestDb();
  await seed(conn.db);
});
afterAll(() => conn.close());

const KEY = "k-test";
const req = (url: string, key: string | null = KEY) => new Request(`http://x${url}`, key ? { headers: { "x-app-key": key } } : undefined);

beforeAll(() => {
  vi.stubEnv("APP_ACCESS_KEY", KEY);
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("/api/metrics endpoints", () => {
  it("receipt: 400 for a bad id, 404 for unknown, 200 with the receipt", async () => {
    const { GET } = await import("@/app/api/metrics/receipt/[leadId]/route");
    const call = (id: string) => GET(req(`/api/metrics/receipt/${id}`), { params: Promise.resolve({ leadId: id }) });
    expect((await call("nope")).status).toBe(400);
    expect((await call("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    const [lead] = await conn.db.select().from(s.leads).limit(1);
    const res = await call(lead.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leadId).toBe(lead.id);
    expect(body.isDemo).toBe(true);
  });

  it("matrix: real only by default, demo block with ?demo=1", async () => {
    const { GET } = await import("@/app/api/metrics/matrix/route");
    const a = await (await GET(req("/api/metrics/matrix"))).json();
    expect(a.demo).toBeNull();
    expect(a.real.totals.found).toBe(0);
    const b = await (await GET(req("/api/metrics/matrix?demo=1"))).json();
    expect(b.demo.totals.found).toBe(3);
    expect(b.real.totals.found).toBe(0);
  });

  it("receipt and matrix: 401 without or with a wrong key; public stays open", async () => {
    const receipt = await import("@/app/api/metrics/receipt/[leadId]/route");
    const matrix = await import("@/app/api/metrics/matrix/route");
    const pub = await import("@/app/api/metrics/public/route");
    const id = "00000000-0000-4000-8000-000000000000";
    const ctx = { params: Promise.resolve({ leadId: id }) };
    expect((await receipt.GET(req(`/api/metrics/receipt/${id}`, null), ctx)).status).toBe(401);
    expect((await receipt.GET(req(`/api/metrics/receipt/${id}`, "bad"), ctx)).status).toBe(401);
    expect((await matrix.GET(req("/api/metrics/matrix", null))).status).toBe(401);
    expect((await matrix.GET(req("/api/metrics/matrix", "bad"))).status).toBe(401);
    expect((await pub.GET()).status).toBe(200);
  });

  it("public: honest empty state with demo-only data", async () => {
    const { GET } = await import("@/app/api/metrics/public/route");
    const body = await (await GET()).json();
    expect(body.hasData).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/Demo|slug/);
  });

  it("responds 503 with a clear message when the DB cannot be prepared", async () => {
    const { GET } = await import("@/app/api/metrics/public/route");
    failMigration = true;
    const res = await GET();
    failMigration = false;
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/migraci/);
  });
});

describe("auto migration", () => {
  it("migrates an empty database once and is memoized", async () => {
    const fresh = createDb("", "memory://");
    await expect(fresh.db.select().from(s.leads)).rejects.toThrow();
    const p1 = ensureMigrated(fresh);
    expect(ensureMigrated(fresh)).toBe(p1);
    await p1;
    expect(await fresh.db.select().from(s.leads)).toEqual([]);
    expect(await getReadyDb(fresh)).toBe(fresh.db);
    await fresh.close();
  });
});
