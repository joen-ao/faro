import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { migrate } from "@/db/migrate";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  conn = await createTestDb();
});
afterAll(() => conn.close());

async function base() {
  const db = conn.db;
  const [ws] = await db.insert(s.workspaces).values({ name: "w" }).returning();
  const [icp] = await db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "p" }).returning();
  const [hunt] = await db.insert(s.hunts).values({ icpProfileId: icp.id }).returning();
  const [co] = await db.insert(s.companies).values({ name: "Acme", normalizedName: "acme" }).returning();
  const [lead] = await db
    .insert(s.leads)
    .values({ companyId: co.id, huntId: hunt.id, primarySource: "osm", slug: `slug-${co.id}` })
    .returning();
  return { ws, icp, hunt, co, lead };
}

describe("migrations", () => {
  it("create all 16 tables and are idempotent", async () => {
    await migrate(conn); // second run: no-op
    const r = (await conn.db.execute(
      sql`select table_name from information_schema.tables where table_schema='public' order by 1`,
    )) as unknown as { rows: { table_name: string }[] };
    const names = r.rows.map((x) => x.table_name);
    for (const t of [
      "workspaces", "icp_profiles", "hunts", "companies", "company_sources", "contact_points", "fit_assessments",
      "leads", "messages", "events", "qualifications", "cost_entries", "cost_rates", "ad_spend", "suppression", "api_calls",
    ]) expect(names).toContain(t);
  });
});

describe("basic inserts", () => {
  it("inserts a row in every table with sane defaults", async () => {
    const db = conn.db;
    const { icp, hunt, co, lead } = await base();
    expect(lead.status).toBe("found");
    expect(co.isDemo).toBe(false);
    expect(co.isLegalEntity).toBe(true);
    await db.insert(s.companySources).values({ companyId: co.id, sourceChannel: "osm", externalId: "n1" });
    await db.insert(s.contactPoints).values({ companyId: co.id, type: "email", value: "info@acme.co", isGeneric: true });
    await db.insert(s.fitAssessments).values({ companyId: co.id, icpProfileId: icp.id, score: 80 });
    await db.insert(s.messages).values({ leadId: lead.id, contactChannel: "email", body: "hola" });
    await db.insert(s.events).values({ leadId: lead.id, type: "sent" });
    await db.insert(s.qualifications).values({ leadId: lead.id, origin: "dapta", qualified: true });
    const [ce] = await db
      .insert(s.costEntries)
      .values({ leadId: lead.id, huntId: hunt.id, category: "ai", quantity: 10, unit: "tokens", rate: 0.5, usd: 5 })
      .returning();
    expect(ce.usd).toBe(5);
    expect(ce.isDemo).toBe(false);
    await db.insert(s.costRates).values({ key: "k-test", category: "data", unit: "call", usd: 0.1 });
    await db.insert(s.adSpend).values({ platform: "meta", campaign: "c", date: "2026-10-17", usd: 1 });
    await db.insert(s.suppression).values({ kind: "email", value: "x@y.co", reason: "opt_out" });
    await db.insert(s.apiCalls).values({ service: "overpass" });
  });

  it("rejects invalid enum values", async () => {
    const { co } = await base();
    await expect(
      conn.db.insert(s.leads).values({ companyId: co.id, primarySource: "nope" as never, slug: "bad-enum" }),
    ).rejects.toThrow();
  });
});

describe("unique constraints", () => {
  it("company_sources(source_channel, external_id)", async () => {
    const { co } = await base();
    const v = { companyId: co.id, sourceChannel: "rues" as const, externalId: "dup-1" };
    await conn.db.insert(s.companySources).values(v);
    await expect(conn.db.insert(s.companySources).values(v)).rejects.toThrow();
    // same external id on another channel is fine
    await conn.db.insert(s.companySources).values({ ...v, sourceChannel: "reps" });
  });

  it("leads.slug", async () => {
    const { co, hunt } = await base();
    await expect(
      conn.db.insert(s.leads).values({ companyId: co.id, huntId: hunt.id, primarySource: "osm", slug: `slug-${co.id}` }),
    ).rejects.toThrow();
  });

  it("suppression.value", async () => {
    await conn.db.insert(s.suppression).values({ kind: "domain", value: "dup.co", reason: "opt_out" });
    await expect(conn.db.insert(s.suppression).values({ kind: "domain", value: "dup.co", reason: "again" })).rejects.toThrow();
  });

  it("cost_rates.key", async () => {
    await conn.db.insert(s.costRates).values({ key: "dup-key", category: "ai", unit: "u", usd: 1 });
    await expect(conn.db.insert(s.costRates).values({ key: "dup-key", category: "ai", unit: "u", usd: 2 })).rejects.toThrow();
  });
});
