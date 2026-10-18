import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { AppDb } from "@/db/types";
import { listHunts } from "@/features/hunts/list";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
let db: AppDb;
let huntId: string;

beforeAll(async () => {
  conn = await createTestDb();
  db = conn.db as unknown as AppDb;
  const [ws] = await db.insert(s.workspaces).values({ name: "Real" }).returning();
  const [icp] = await db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "Clínicas dentales en Bogotá", criteria: { sector: "dental", city: "Bogota" } }).returning();
  const [hunt] = await db.insert(s.hunts).values({ icpProfileId: icp.id, status: "completed" }).returning();
  huntId = hunt.id;
  const mk = async (i: number, status: (typeof s.leadStatusEnum.enumValues)[number], isDemo = false) => {
    const [c] = await db.insert(s.companies).values({ name: `Empresa ${i}`, normalizedName: `empresa ${i}`, isDemo }).returning();
    const [l] = await db.insert(s.leads).values({ companyId: c.id, huntId, status, primarySource: "osm", slug: `s${i}`, isDemo }).returning();
    return l.id;
  };
  await mk(1, "found");
  const fit = await mk(2, "fit");
  const contacted = await mk(3, "contacted");
  await mk(4, "qualified");
  await mk(5, "fit", true); // demo: never counted with real data
  await db.insert(s.messages).values([
    { leadId: fit, contactChannel: "email", recipient: "info@a.co", status: "queued", body: "x" },
    { leadId: contacted, contactChannel: "email", recipient: "info@b.co", status: "sent", body: "x" },
  ] as never);
});
afterAll(async () => conn.close());

describe("listHunts", () => {
  it("summarises each hunt with real-only counts", async () => {
    const [h] = await listHunts(db);
    expect(h).toMatchObject({ id: huntId, sector: "dental", city: "Bogota", status: "completed", isDemo: false, leads: 4, fit: 3, queued: 1, sent: 1, responded: 1, qualified: 1 });
  });
});
