import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { AppDb } from "@/db/types";
import { listHunts } from "@/features/hunts/list";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
let db: AppDb;
let huntId: string;
let demoHuntId: string;

type Src = (typeof s.sourceChannelEnum.enumValues)[number];

beforeAll(async () => {
  conn = await createTestDb();
  db = conn.db as unknown as AppDb;
  const [ws] = await db.insert(s.workspaces).values({ name: "Real" }).returning();
  const [icp] = await db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "Clínicas dentales en Bogotá", criteria: { sector: "dental", city: "Bogota" } }).returning();
  const pair = { keptCompanyId: "x", keptName: "A", mergedName: "A SAS", reason: "nit", similarity: 1 };
  const [hunt] = await db
    .insert(s.hunts)
    .values({ icpProfileId: icp.id, status: "completed", createdAt: new Date("2026-10-17T10:00:00Z"), progress: { dedupe: { pairs: [pair, pair, { ...pair, isMock: true }] } } })
    .returning();
  huntId = hunt.id;
  const [demoHunt] = await db.insert(s.hunts).values({ icpProfileId: icp.id, status: "completed", createdAt: new Date("2026-10-16T10:00:00Z") }).returning();
  demoHuntId = demoHunt.id;
  const mk = async (i: number, status: (typeof s.leadStatusEnum.enumValues)[number], isDemo = false, source: Src = "osm", hId = huntId) => {
    const [c] = await db.insert(s.companies).values({ name: `Empresa ${i}`, normalizedName: `empresa ${i}`, isDemo }).returning();
    const [l] = await db.insert(s.leads).values({ companyId: c.id, huntId: hId, status, primarySource: source, slug: `s${i}`, isDemo }).returning();
    return l.id;
  };
  await mk(1, "found");
  const fit = await mk(2, "fit", false, "rues");
  const contacted = await mk(3, "contacted");
  await mk(4, "qualified");
  await mk(5, "fit", true, "reps"); // demo lead on a real hunt: never counted with real data
  await mk(6, "fit", true, "osm", demoHuntId);
  await mk(7, "found", true, "rues", demoHuntId);
  await db.insert(s.messages).values([
    { leadId: fit, contactChannel: "email", recipient: "info@a.co", status: "queued", body: "x" },
    { leadId: contacted, contactChannel: "email", recipient: "info@b.co", status: "sent", body: "x" },
  ] as never);
});
afterAll(async () => conn.close());

describe("listHunts", () => {
  it("summarises each hunt with real-only counts and a real-only breakdown by source", async () => {
    const [h] = await listHunts(db);
    expect(h).toMatchObject({ id: huntId, sector: "dental", city: "Bogota", status: "completed", isDemo: false, leads: 4, fit: 3, queued: 1, sent: 1, responded: 1, qualified: 1 });
    expect(h.bySource).toEqual([
      { source: "osm", leads: 3 },
      { source: "rues", leads: 1 },
    ]);
    expect(h.mergedDuplicates).toBe(2); // the mock pair is left out
  });

  it("a hunt with only demo leads is flagged DEMO and shows only its own demo counts", async () => {
    const d = (await listHunts(db)).find((x) => x.id === demoHuntId)!;
    expect(d).toMatchObject({ isDemo: true, leads: 2, fit: 1, sent: 0, qualified: 0, mergedDuplicates: 0 });
    expect(d.bySource).toEqual([
      { source: "osm", leads: 1 },
      { source: "rues", leads: 1 },
    ]);
  });
});
