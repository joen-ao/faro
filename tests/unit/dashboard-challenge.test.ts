import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import type { AppDb } from "@/db/types";
import { getDashboardData } from "@/features/dashboard/data";
import { buildChallenge, queryChallengeFacts, type ChallengeItem } from "@/features/dashboard/challenge";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
let db: AppDb;
const byId = (items: ChallengeItem[], id: string) => items.find((i) => i.id === id)!;

beforeAll(async () => {
  conn = await createTestDb();
  db = conn.db as unknown as AppDb;
  await seed(conn.db); // demo data: must never count
}, 60_000);
afterAll(() => conn.close());

describe("Reto Dapta challenge panel", () => {
  it("with no real data everything is pending except the 'no natural persons contacted' rule", async () => {
    const d = await getDashboardData(db);
    const st = Object.fromEntries(d.challenge.map((i) => [i.id, i.status]));
    expect(st).toEqual({
      sources: "pending",
      dedupe: "pending",
      icp: "pending",
      outreach: "pending",
      dashboard: "pending",
      "public-data": "done",
      dapta: "pending",
      "qualified-rate": "pending",
      cplc: "pending",
    });
    expect(d.challenge.filter((i) => i.group === "required")).toHaveLength(6);
    // no CPL table without real leads, so no dangling anchor
    expect(byId(d.challenge, "dashboard").href).toBeUndefined();
    expect(d.challenge.every((i) => i.title.length > 0)).toBe(true);
  });

  it("counts real sources, unique companies, merged duplicates and keeps 'en curso' until someone responds", async () => {
    const [ws] = await db.insert(s.workspaces).values({ name: "Real" }).returning();
    const [icp] = await db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "p", threshold: 60 }).returning();
    const pairs = [
      { keptCompanyId: "a", keptName: "A", mergedName: "A2", mergedChannel: "osm", mergedExternalId: "1", reason: "name", similarity: 0.9 },
      { keptCompanyId: "b", keptName: "B", mergedName: "B2", mergedChannel: "osm", mergedExternalId: "2", reason: "name", similarity: 0.9, isMock: true },
    ];
    const [hunt] = await db.insert(s.hunts).values({ icpProfileId: icp.id, progress: { dedupe: { merged: 2, pairs }, excludedPersonal: 4 } }).returning();
    const leadIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const [c] = await db.insert(s.companies).values({ name: `R ${i} SAS`, normalizedName: `r ${i}` }).returning();
      await db.insert(s.companySources).values([
        { companyId: c.id, sourceChannel: "osm", externalId: `osm-${i}` },
        ...(i === 0 ? [{ companyId: c.id, sourceChannel: "rues" as const, externalId: "rues-0" }, { companyId: c.id, sourceChannel: "reps" as const, externalId: "reps-0", isMock: true }] : []),
      ]);
      const [l] = await db.insert(s.leads).values({ companyId: c.id, huntId: hunt.id, primarySource: "osm", slug: `r-${i}`, fitScore: i < 2 ? 80 : 30 }).returning();
      leadIds.push(l.id);
    }
    await db.insert(s.messages).values({ leadId: leadIds[0], contactChannel: "email", body: "b", status: "sent", sentAt: new Date() });
    await db.insert(s.costEntries).values({ leadId: leadIds[0], sourceChannel: "osm", contactChannel: "email", category: "email", quantity: 1, unit: "x", rate: 1, usd: 1 });
    await db.insert(s.events).values({ leadId: leadIds[0], type: "click", payload: { kind: "page_view" } });

    let d = await getDashboardData(db);
    const f = await queryChallengeFacts(db);
    expect(f.companiesBySource).toEqual([
      { source: "osm", companies: 3 },
      { source: "rues", companies: 1 },
    ]);
    expect(f).toMatchObject({ uniqueCompanies: 3, mergedDuplicates: 1, excludedPersons: 4, daptaEvaluated: 0 });
    expect(byId(d.challenge, "sources")).toMatchObject({ status: "done", value: "2 fuentes" });
    expect(byId(d.challenge, "dedupe")).toMatchObject({ status: "done", value: "3 empresas únicas" });
    expect(byId(d.challenge, "icp")).toMatchObject({ status: "done", value: "2 de 3" });
    expect(byId(d.challenge, "outreach")).toMatchObject({ status: "progress", value: "1 enviado" });
    expect(byId(d.challenge, "outreach").detail).toContain("1 abrió");
    expect(byId(d.challenge, "dashboard")).toMatchObject({ status: "done", href: "#cpl" });
    expect(byId(d.challenge, "dapta").status).toBe("progress");

    await db.insert(s.events).values({ leadId: leadIds[0], type: "reply" });
    await db.insert(s.qualifications).values({ leadId: leadIds[0], origin: "dapta", qualified: true });
    d = await getDashboardData(db);
    expect(byId(d.challenge, "outreach").status).toBe("done");
    expect(byId(d.challenge, "dapta")).toMatchObject({ status: "done", value: "1 lead evaluado" });
    expect(byId(d.challenge, "qualified-rate").status).toBe("done");
    expect(byId(d.challenge, "cplc")).toMatchObject({ status: "done", value: "$1.00" });
  });

  it("flags natural persons contacted as pending", () => {
    const facts = { companiesBySource: [], uniqueCompanies: 0, mergedDuplicates: 0, excludedPersons: 0, daptaQualified: 0, daptaEvaluated: 0 };
    const empty = { excludedMockUsd: 0, excludedDemoUsd: 0, bySource: [], byContact: [], cells: [], unattributedUsd: 0, totals: { found: 0, fit: 0, contacted: 0, opened: 0, responded: 0, chatted: 0, qualified: 0, costUsd: 0, cpl: null, cplc: null } } as never;
    const items = buildChallenge(facts, empty, { naturalPersonsContacted: 1, senderIdentifiedPct: null, optOutsTotal: 0, optOutsRespected: 0, blockedBySchedule: 0, blockedTotal: 0, sentTotal: 1 });
    expect(byId(items, "public-data").status).toBe("pending");
  });

  it("projects CPLC from the real CPL, labelled as an assumption, while nobody qualified yet", () => {
    const facts = { companiesBySource: [], uniqueCompanies: 0, mergedDuplicates: 0, excludedPersons: 0, daptaQualified: 0, daptaEvaluated: 0 };
    const real = { excludedMockUsd: 0, excludedDemoUsd: 0, bySource: [], byContact: [], cells: [], unattributedUsd: 0, totals: { found: 100, fit: 10, contacted: 10, opened: 2, responded: 0, chatted: 0, qualified: 0, costUsd: 0.2, cpl: 0.02, cplc: null } } as never;
    const item = byId(buildChallenge(facts, real, { naturalPersonsContacted: 0, senderIdentifiedPct: null, optOutsTotal: 0, optOutsRespected: 0, blockedBySchedule: 0, blockedTotal: 0, sentTotal: 10 }), "cplc");
    expect(item.value).toBe("n/d");
    expect(item.detail).toContain("Proyección (supuesto, no es dato real)");
    expect(item.detail).toContain("1 de cada 10");
  });
});
