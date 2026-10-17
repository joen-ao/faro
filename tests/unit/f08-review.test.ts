import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seedCostRates } from "@/db/seed";
import { handleIcpParse } from "@/features/icp/api";
import { ICP_EXAMPLES, IcpCriteria } from "@/features/icp";
import { loadAiRates, recordAiCost } from "@/features/scoring";
import { handleLeadScore } from "@/features/scoring/api";
import { createMockAnthropic, type AnthropicAdapter } from "@/integrations/anthropic";
import { createTestDb } from "../helpers/test-db";

const icp = ICP_EXAMPLES[0].criteria;
let conn: Awaited<ReturnType<typeof createTestDb>>;
let icpId: string;

async function mkLead(slug: string, opts: { legal: boolean; text?: string }) {
  const { db } = conn;
  const [co] = await db
    .insert(s.companies)
    .values({ name: `Clinica ${slug} SAS`, normalizedName: slug, nit: "900", city: "Bogota", website: "https://w.example", isLegalEntity: opts.legal })
    .returning();
  await db.insert(s.companySources).values([
    { companyId: co.id, sourceChannel: "osm", externalId: `o-${slug}`, raw: { tags: { amenity: "dentist" } }, sourceUrl: "https://osm.example/1" },
    { companyId: co.id, sourceChannel: "rues", externalId: `r-${slug}`, raw: { ciiu: "8622" }, sourceUrl: "https://rues.example/1" },
    ...(opts.text ? [{ companyId: co.id, sourceChannel: "website" as const, externalId: `w-${slug}`, raw: { websiteText: opts.text }, sourceUrl: "https://w.example" }] : []),
  ]);
  await db.insert(s.contactPoints).values({ companyId: co.id, type: "email", value: "info@w.example", isGeneric: true, evidenceUrl: "https://w.example/c" });
  const [lead] = await db.insert(s.leads).values({ companyId: co.id, primarySource: "osm", slug }).returning();
  return lead.id;
}

beforeAll(async () => {
  conn = await createTestDb();
  await seedCostRates(conn.db);
  const [ws] = await conn.db.insert(s.workspaces).values({ name: "t" }).returning();
  const [row] = await conn.db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "p", criteria: icp }).returning();
  icpId = row.id;
});
afterAll(() => conn.close());

describe("review round 1 fixes", () => {
  it("MAJOR-3: natural person gets score 0 and is not promoted to fit", async () => {
    const id = await mkLead("natural", { legal: false });
    const res = await handleLeadScore(conn.db, id, { icpProfileId: icpId }, { ai: createMockAnthropic() });
    expect(res.status).toBe(200);
    expect((res.body as { score: number }).score).toBe(0);
    const [lead] = await conn.db.select().from(s.leads).where((await import("drizzle-orm")).eq(s.leads.id, id));
    expect(lead).toMatchObject({ fitScore: 0, status: "found" });
  });

  it("MAJOR-1: validation failure -> 502, billed tokens still recorded as cost", async () => {
    const id = await mkLead("badjson", { legal: true, text: "Reserve su cita con nuestra agenda en linea 24 horas." });
    const bad: AnthropicAdapter = { model: "m", isMock: false, completeRaw: async () => ({ text: "nope", usage: { input_tokens: 100, output_tokens: 10 } }) };
    const before = (await conn.db.select().from(s.fitAssessments)).length;
    const res = await handleLeadScore(conn.db, id, { icpProfileId: icpId }, { ai: bad });
    expect(res.status).toBe(502);
    const costs = (await conn.db.select().from(s.costEntries)).filter((c) => c.leadId === id);
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ category: "ai", quantity: 220, isMock: false });
    expect(await conn.db.select().from(s.fitAssessments)).toHaveLength(before);
  });

  it("MAJOR-1: call error after a billed attempt is a 502 and keeps usage", async () => {
    const id = await mkLead("callerr", { legal: true, text: "Reserve su cita con nuestra agenda en linea 24 horas." });
    let n = 0;
    const flaky: AnthropicAdapter = {
      model: "m",
      isMock: false,
      completeRaw: async () => {
        if (n++ === 0) return { text: "garbage", usage: { input_tokens: 50, output_tokens: 5 } };
        throw new Error("503");
      },
    };
    const res = await handleLeadScore(conn.db, id, { icpProfileId: icpId }, { ai: flaky });
    expect(res.status).toBe(502);
    const costs = (await conn.db.select().from(s.costEntries)).filter((c) => c.leadId === id);
    expect(costs[0].quantity).toBe(55);
  });

  it("MAJOR-2: icp parse books cost on success and on validation failure", async () => {
    const booked: Array<{ tokens: number; mock: boolean }> = [];
    const recordCost = async (r: { usage: { input_tokens: number; output_tokens: number }; isMock: boolean }) => {
      booked.push({ tokens: r.usage.input_tokens + r.usage.output_tokens, mock: r.isMock });
      await recordAiCost(conn.db, { usage: r.usage, rates: await loadAiRates(conn.db), isMock: r.isMock, evidence: "icp_parse" });
    };
    const ok = await handleIcpParse({ prompt: "Clinicas dentales en Bogota" }, { ai: createMockAnthropic(), recordCost });
    expect(ok.status).toBe(200);
    const bad: AnthropicAdapter = { model: "m", isMock: false, completeRaw: async () => ({ text: "x", usage: { input_tokens: 10, output_tokens: 1 } }) };
    expect((await handleIcpParse({ prompt: "dentistas en Bogota" }, { ai: bad, recordCost })).status).toBe(502);
    const down: AnthropicAdapter = { model: "m", isMock: false, completeRaw: async () => Promise.reject(new Error("x")) };
    expect((await handleIcpParse({ prompt: "dentistas en Bogota" }, { ai: down, recordCost })).status).toBe(502);
    expect(booked).toHaveLength(2); // zero-token call error books nothing
    expect(booked[0].mock).toBe(true);
    expect(booked[1]).toEqual({ tokens: 22, mock: false });
    const failing = await handleIcpParse({ prompt: "Clinicas dentales en Bogota" }, { ai: createMockAnthropic(), recordCost: async () => Promise.reject(new Error("db")) });
    expect(failing.status).toBe(200);
  });

  it("MINOR: bbox ranges are validated", () => {
    const base = { sector: "x", city: "y" };
    expect(IcpCriteria.safeParse({ ...base, bbox: [4, -74, 5, -73] }).success).toBe(true);
    expect(IcpCriteria.safeParse({ ...base, bbox: [100, -74, 101, -73] }).success).toBe(false);
    expect(IcpCriteria.safeParse({ ...base, bbox: [5, -74, 4, -73] }).success).toBe(false);
  });
});
