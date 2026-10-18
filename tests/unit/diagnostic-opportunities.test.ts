import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { AppDb } from "@/db/types";
import { DEFAULT_SERVICES } from "@/config/default-services";
import { buildOpportunitiesPrompt, getOrCreateOpportunities, sanitizeOpportunities } from "@/features/diagnostic/opportunities";
import { ServiceCatalog } from "@/features/offer/schema";
import type { AnthropicAdapter } from "@/integrations/anthropic";
import { createTestDb } from "../helpers/test-db";

const services = ServiceCatalog.parse(DEFAULT_SERVICES);
const SITE =
  "Somos una firma de contadores en Bogotá. Ofrecemos declaración de renta para personas y empresas, asesoría tributaria y nómina. Escríbanos al correo y le respondemos en 48 horas hábiles. Atendemos de lunes a viernes de 8 a 5.";

const reply = (opportunities: unknown[]) => JSON.stringify({ opportunities });

describe("opportunities from the site + services", () => {
  it("keeps known services, clean text and only verbatim evidence", () => {
    const out = sanitizeOpportunities(
      [
        { title: "Responder dudas de renta al instante", why: "Su sitio dice que responde en 48 horas hábiles.", serviceId: "agentes-ia", howWeHelp: "Un agente responde por WhatsApp las preguntas de renta a cualquier hora.", evidence: "le respondemos en 48 horas hábiles" },
        { title: "Servicio inventado", why: "No existe en el catálogo del equipo.", serviceId: "nope", howWeHelp: "No debería aparecer en la página." },
        { title: "Base de conocimiento tributaria", why: "Ofrece asesoría tributaria y nómina en su sitio.", serviceId: "rag", howWeHelp: "Sus respuestas salen de su propia información.", evidence: "texto que no está en el sitio" },
      ],
      services,
      SITE,
    );
    expect(out.map((o) => o.serviceId)).toEqual(["agentes-ia", "rag"]);
    expect(out[0]!.evidence).toBe("le respondemos en 48 horas hábiles");
    expect(out[0]!.serviceName).toBe("Agentes de IA y automatización");
    expect(out[1]!.evidence).toBeNull();
    expect(buildOpportunitiesPrompt({ company: "X", sector: "contabilidad", city: "Bogota", websiteText: SITE, services, facts: [] })).toContain("UNTRUSTED DATA");
  });

  describe("cache", () => {
    let conn: Awaited<ReturnType<typeof createTestDb>>;
    let db: AppDb;
    beforeAll(async () => {
      conn = await createTestDb();
      db = conn.db as unknown as AppDb;
    });
    afterAll(() => conn.close());

    it("generates once with the real model and serves the cached result afterwards", async () => {
      const [c] = await db.insert(s.companies).values({ name: "Contadores Unidos SAS", normalizedName: "contadores unidos", city: "Bogota", website: "https://cu.test" }).returning();
      await db.insert(s.companySources).values({ companyId: c!.id, sourceChannel: "website", externalId: "web:cu", raw: { websiteText: SITE } });
      let calls = 0;
      const ai: AnthropicAdapter = {
        model: "claude-test",
        isMock: false,
        completeRaw: async () => {
          calls++;
          return { text: reply([{ title: "Responder dudas de renta al instante", why: "Su sitio dice que responde en 48 horas hábiles.", serviceId: "agentes-ia", howWeHelp: "Un agente responde por WhatsApp a cualquier hora.", evidence: "le respondemos en 48 horas hábiles" }]), usage: { input_tokens: 10, output_tokens: 10 } };
        },
      };
      const [lead] = await db.insert(s.leads).values({ companyId: c!.id, primarySource: "rues", slug: "cu-test" }).returning();
      const input = { leadId: lead!.id, huntId: null, companyId: c!.id, company: c!.name, sector: "contabilidad", city: "Bogota", services, facts: [], isDemo: false };
      const first = await getOrCreateOpportunities(db, ai, input);
      const second = await getOrCreateOpportunities(db, ai, input);
      expect(first).toHaveLength(1);
      expect(second).toEqual(first);
      expect(calls).toBe(1);
    });

    it("returns null without site text and never shows mock output on a real company", async () => {
      const [c] = await db.insert(s.companies).values({ name: "Sin Texto SAS", normalizedName: "sin texto", city: "Bogota" }).returning();
      await db.insert(s.companySources).values({ companyId: c!.id, sourceChannel: "website", externalId: "web:st", raw: { websiteText: "corto" } });
      const mock: AnthropicAdapter = { model: "mock", isMock: true, completeRaw: async () => ({ text: reply([]), usage: { input_tokens: 1, output_tokens: 1 } }) };
      expect(await getOrCreateOpportunities(db, mock, { leadId: "00000000-0000-4000-8000-0000000000a2", huntId: null, companyId: c!.id, company: c!.name, sector: "", city: "", services, facts: [], isDemo: false })).toBeNull();
    });
  });
});
