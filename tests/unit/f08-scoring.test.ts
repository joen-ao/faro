import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCostTotals } from "@/db/queries";
import * as s from "@/db/schema";
import { seedCostRates } from "@/db/seed";
import { ICP_EXAMPLES } from "@/features/icp";
import { handleLeadScore } from "@/features/scoring/api";
import { aiCostUsd, DEFAULT_AI_RATES, loadAiRates, scoreFit, type ScoreCompany } from "@/features/scoring";
import { createMockAnthropic, type AnthropicAdapter } from "@/integrations/anthropic";
import { createTestDb } from "../helpers/test-db";

const icp = ICP_EXAMPLES[0].criteria; // dental Bogota, signal: agenda en linea

const full: ScoreCompany = {
  name: "Clinica Dental Prueba SAS",
  city: "Bogotá",
  website: "https://prueba.example",
  nit: "900123456",
  isLegalEntity: true,
  contacts: [{ type: "email", value: "info@prueba.example", isGeneric: true, evidenceUrl: "https://prueba.example/contacto" }],
  sources: [
    { channel: "osm", url: "https://www.openstreetmap.org/node/1", osmTags: ["amenity=dentist"] },
    { channel: "rues", url: "https://www.datos.gov.co/resource/c82u-588k", ciiu: "8622" },
  ],
  websiteText: "Bienvenidos. Reserve su cita con nuestra agenda en linea 24 horas.",
};

describe("aiCostUsd", () => {
  it("multiplies tokens by per-1M rates", () => {
    expect(aiCostUsd({ input_tokens: 1_000_000, output_tokens: 0 }, { inputPer1M: 3, outputPer1M: 15 })).toBe(3);
    expect(aiCostUsd({ input_tokens: 2000, output_tokens: 500 }, DEFAULT_AI_RATES)).toBeCloseTo(0.0135, 6);
    expect(aiCostUsd({ input_tokens: 0, output_tokens: 0 }, DEFAULT_AI_RATES)).toBe(0);
  });
});

describe("scoreFit", () => {
  it("scores 100 with evidence and URL on every met criterion", async () => {
    const r = await scoreFit(full, icp, { ai: createMockAnthropic() });
    expect(r.score).toBe(100);
    expect(r.meetsThreshold).toBe(true);
    for (const c of r.criteria.filter((x) => x.cumplido)) {
      expect(c.evidencia.length).toBeGreaterThan(0);
      expect(c.url).toMatch(/^https?:\/\//);
    }
    const signal = r.criteria.find((c) => c.criterio.startsWith("Senales"))!;
    expect(signal.evidencia).toContain("agenda en linea");
    expect(r.is_mock).toBe(true);
    expect(r.usage.input_tokens).toBeGreaterThan(0);
    expect(r.why_now).toContain("agenda");
  });

  it("rules-only (no AI) never claims signals and uses no tokens", async () => {
    const r = await scoreFit(full, icp);
    expect(r.score).toBe(90);
    expect(r.criteria.find((c) => c.criterio.startsWith("Senales"))!.cumplido).toBe(false);
    expect(r.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
    expect(r.model).toBeNull();
  });

  it("drops AI quotes that are not in the source text (no invented evidence)", async () => {
    const liar: AnthropicAdapter = {
      model: "liar",
      isMock: false,
      completeRaw: async () => ({
        text: JSON.stringify({ signals: [{ signal: "agenda en linea", found: true, quote: "tenemos app de citas" }], why_now: "Inventado" }),
        usage: { input_tokens: 5, output_tokens: 5 },
      }),
    };
    const r = await scoreFit(full, icp, { ai: liar });
    expect(r.criteria.find((c) => c.criterio.startsWith("Senales"))!.cumplido).toBe(false);
    expect(r.why_now).not.toContain("Inventado");
    expect(r.score).toBe(90);
  });

  it("criteria without a URL are not met; empty company scores low", async () => {
    const bare: ScoreCompany = { name: "X", city: null, website: null, nit: null, isLegalEntity: true, contacts: [], sources: [], websiteText: null };
    const r = await scoreFit(bare, icp);
    expect(r.score).toBe(0);
    expect(r.meetsThreshold).toBe(false);
    expect(r.criteria.every((c) => !c.cumplido && c.url === null)).toBe(true);
    const noUrl = await scoreFit({ ...bare, city: "Bogota" }, icp);
    expect(noUrl.criteria.find((c) => c.criterio.startsWith("Ciudad"))!.evidencia).toBe("Sin URL de respaldo");
  });

  it("exclusions force score 0; no signals rescales; threshold per ICP", async () => {
    const ex = await scoreFit({ ...full, name: "Profesional Independiente Perez" }, icp);
    expect(ex.score).toBe(0);
    const noSignals = await scoreFit({ ...full, websiteText: null }, { ...icp, signals: [] });
    expect(noSignals.score).toBe(100);
    const strict = await scoreFit(full, icp, { threshold: 95 });
    expect(strict.meetsThreshold).toBe(false);
    const placesOnly = await scoreFit(
      { ...full, sources: [{ channel: "google_places", url: "https://maps.example/p", placesTypes: ["dentist"] }] },
      icp,
    );
    expect(placesOnly.criteria.find((c) => c.criterio.startsWith("Sector"))!.cumplido).toBe(true);
  });

  it("survives AI failure (falls back to rules)", async () => {
    const down: AnthropicAdapter = { model: "x", isMock: false, completeRaw: async () => Promise.reject(new Error("net")) };
    const r = await scoreFit(full, icp, { ai: down });
    expect(r.score).toBe(90);
  });
});

describe("scoring service + endpoint handler (PGlite)", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let leadId: string;
  let icpId: string;
  beforeAll(async () => {
    conn = await createTestDb();
    const { db } = conn;
    await seedCostRates(db);
    const [ws] = await db.insert(s.workspaces).values({ name: "t" }).returning();
    const [icpRow] = await db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "p", criteria: icp, threshold: 60 }).returning();
    icpId = icpRow.id;
    const [co] = await db
      .insert(s.companies)
      .values({ name: full.name, normalizedName: "clinica dental prueba", nit: full.nit, city: "Bogota", website: full.website })
      .returning();
    await db.insert(s.companySources).values([
      { companyId: co.id, sourceChannel: "osm", externalId: "n1", raw: { tags: { amenity: "dentist" } }, sourceUrl: "https://www.openstreetmap.org/node/1" },
      { companyId: co.id, sourceChannel: "rues", externalId: "r1", raw: { ciiu: "8622" }, sourceUrl: "https://www.datos.gov.co/resource/c82u-588k" },
      { companyId: co.id, sourceChannel: "website", externalId: "w1", raw: { websiteText: full.websiteText }, sourceUrl: full.website },
    ]);
    await db.insert(s.contactPoints).values({ companyId: co.id, type: "email", value: "info@prueba.example", isGeneric: true, evidenceUrl: "https://prueba.example/contacto" });
    const [lead] = await db.insert(s.leads).values({ companyId: co.id, primarySource: "osm", slug: "t-1" }).returning();
    leadId = lead.id;
  });
  afterAll(() => conn.close());

  it("persists assessment, updates lead, records mock AI cost outside real totals", async () => {
    const res = await handleLeadScore(conn.db, leadId, { icpProfileId: icpId }, { ai: createMockAnthropic() });
    expect(res.status).toBe(200);
    expect((res.body as { score: number }).score).toBe(100);
    const fits = await conn.db.select().from(s.fitAssessments);
    expect(fits).toHaveLength(1);
    expect(fits[0].inputTokens).toBeGreaterThan(0);
    const [lead] = await conn.db.select().from(s.leads);
    expect(lead).toMatchObject({ fitScore: 100, status: "fit" });
    const costs = await conn.db.select().from(s.costEntries);
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ category: "ai", isMock: true, unit: "tokens" });
    expect(costs[0].usd).toBeGreaterThan(0);
    expect((await getCostTotals(conn.db)).totalUsd).toBe(0);
    const calls = await conn.db.select().from(s.apiCalls);
    expect(calls[0]).toMatchObject({ service: "anthropic", endpoint: "score_signals", isMock: true });
    expect(await loadAiRates(conn.db)).toEqual({ inputPer1M: 3, outputPer1M: 15 });
  });

  it("returns clear 400/404/422 errors", async () => {
    const ai = createMockAnthropic();
    const uuid = "00000000-0000-4000-8000-000000000000";
    expect((await handleLeadScore(conn.db, "nope", {}, { ai })).status).toBe(400);
    expect((await handleLeadScore(conn.db, leadId, { icpProfileId: "x" }, { ai })).status).toBe(400);
    expect((await handleLeadScore(conn.db, uuid, { icpProfileId: icpId }, { ai })).status).toBe(404);
    expect((await handleLeadScore(conn.db, leadId, { icpProfileId: uuid }, { ai })).status).toBe(404);
    const [ws] = await conn.db.select().from(s.workspaces);
    const [bad] = await conn.db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "p", criteria: {} }).returning();
    expect((await handleLeadScore(conn.db, leadId, { icpProfileId: bad.id }, { ai })).status).toBe(422);
  });
});
