import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/types";
import { DEFAULT_SERVICES } from "@/config/default-services";
import { deterministicAngles, mockServicesSuggest } from "@/features/offer/angles";
import { handleOfferAngles, handleServicesSuggest } from "@/features/offer/api";
import { howWeHelp, recommendService, suggestionLine, type FindingLike } from "@/features/offer/match";
import { effectiveOffer } from "@/features/offer/resolve";
import { CatalogSetting, cleanOfferText, HuntOffer, parseHuntOffer, Service, ServiceCatalog } from "@/features/offer/schema";
import { eq } from "drizzle-orm";
import { icpProfiles } from "@/db/schema";
import { createHunt } from "@/features/hunts/service";
import { ICP_EXAMPLES } from "@/features/icp/presets";
import { loadEffectiveOffer } from "@/features/offer/resolve";
import { generateMessage } from "@/features/outreach/generate";
import { defaultCatalog, getServiceCatalog, saveServiceCatalog } from "@/features/settings/services";
import { offerContext } from "@/integrations/dapta/leads";
import { buildCsv } from "@/integrations/dapta/csv";
import { buildPushBody } from "@/integrations/dapta/real";
import { createMockAnthropic, type AnthropicAdapter } from "@/integrations/anthropic";
import { parseEnv } from "@/lib/env";
import { createTestDb } from "../helpers/test-db";

process.env.OPTOUT_SECRET ??= "offer-test-secret";

const mokub = ServiceCatalog.parse(DEFAULT_SERVICES);
const opp = (...ids: string[]): FindingLike[] => ids.map((id) => ({ id, status: "opportunity" as const }));
const ok = (...ids: string[]): FindingLike[] => ids.map((id) => ({ id, status: "ok" as const }));
const svc = (o: Partial<Record<string, unknown>> = {}) => ({ name: "Agente de WhatsApp", description: "Responde y agenda por WhatsApp", outcome: "Más citas fuera de horario", ...o });

describe("offer validation", () => {
  it("requires name, description and outcome", () => {
    expect(Service.safeParse(svc()).success).toBe(true);
    expect(Service.safeParse(svc({ name: "" })).success).toBe(false);
    expect(Service.safeParse(svc({ outcome: "   " })).success).toBe(false);
    expect(Service.safeParse({ name: "x y" }).success).toBe(false);
  });

  it("cleans and cuts text: tags, URLs, emails, control chars, limits", () => {
    const s = Service.parse(svc({ name: `<b>Agente</b> https://evil.example ${"x".repeat(200)}`, description: "Escríbanos a ventas@x.co\u0000 ya", entryOffer: "  " }));
    expect(s.name).not.toMatch(/<|evil/);
    expect(s.name.length).toBeLessThanOrEqual(80);
    expect(s.description).toBe("Escríbanos a ya");
    expect(s.entryOffer).toBeUndefined();
  });

  it("never keeps person names in the proof", () => {
    const s = Service.parse(svc({ proof: "La Dra. Ana María Gómez pasó de 10 a 30 citas" }));
    expect(s.proof).toBe("La un cliente pasó de 10 a 30 citas");
    expect(cleanOfferText("Caso del señor Pérez", 100)).toBe("Caso del un cliente");
  });

  it("catalog: 1 to 8 services with unique ids and normalised keywords", () => {
    expect(ServiceCatalog.safeParse([]).success).toBe(false);
    expect(ServiceCatalog.safeParse(Array.from({ length: 9 }, () => svc())).success).toBe(false);
    const c = ServiceCatalog.parse([svc({ keywords: ["WhatsApp", "whatsapp", " Agenda "] }), svc()]);
    expect(c.map((s) => s.id)).toEqual(["agente-de-whatsapp", "agente-de-whatsapp-2"]);
    expect(c[0]!.keywords).toEqual(["whatsapp", "agenda"]);
    expect(CatalogSetting.parse({ services: [svc()], note: "" }).note).toBeUndefined();
  });

  it("hunt offer keeps only angles that point to its services; legacy rows -> null", () => {
    const o = HuntOffer.parse({
      services: mokub.slice(0, 1),
      angles: [
        { text: "Clínicas sin WhatsApp pierden pacientes → Agentes", serviceId: "agentes-ia", signal: "whatsapp" },
        { text: "Otro ángulo de prueba", serviceId: "no-existe", signal: "booking" },
      ],
    });
    expect(o.serviceIds).toEqual(["agentes-ia"]);
    expect(o.angles).toHaveLength(1);
    expect(parseHuntOffer(null)).toBeNull();
    expect(parseHuntOffer({ product: "viejo" })).toBeNull();
    expect(effectiveOffer(null, mokub).origin).toBe("catalog");
    expect(effectiveOffer(o, mokub).services).toHaveLength(1);
  });
});

describe("Mokub default catalog mapping", () => {
  it("loads the four real services with no invented fields", () => {
    expect(mokub.map((s) => s.id)).toEqual(["agentes-ia", "rag", "software-crm", "landing-webs"]);
    expect(mokub[3]!.proof).toBeUndefined();
  });

  it("no WhatsApp -> AI agents", () => {
    const r = recommendService(opp("whatsapp"), mokub);
    expect(r?.service.id).toBe("agentes-ia");
    expect(suggestionLine(r)).toBe("Servicio sugerido: Agentes de IA y automatización · porque su sitio no tiene WhatsApp");
  });

  it("no online booking -> AI agents", () => {
    expect(recommendService([...ok("whatsapp"), ...opp("booking")], mokub)?.service.id).toBe("agentes-ia");
  });

  it("no website -> Landing pages y webs", () => {
    const r = recommendService(opp("no-website"), mokub);
    expect(r?.service.id).toBe("landing-webs");
    expect(r?.reason).toBe("no encontramos un sitio web propio");
  });

  it("outdated site -> Landing pages y webs", () => {
    expect(recommendService([...ok("whatsapp", "booking"), ...opp("freshness")], mokub)?.service.id).toBe("landing-webs");
  });

  it("several problems -> the highest-impact one only", () => {
    const r = recommendService(opp("freshness", "booking", "whatsapp", "social"), mokub);
    expect(r?.finding).toBe("whatsapp");
    expect(r?.service.id).toBe("agentes-ia");
    expect(recommendService(opp("freshness", "no-website", "whatsapp"), mokub)?.service.id).toBe("landing-webs");
  });

  it("an accepted angle can steer the match", () => {
    const angles = [{ text: "x sin agenda → software", serviceId: "software-crm", signal: "booking" as const }];
    expect(recommendService(opp("booking"), mokub, angles)?.service.id).toBe("software-crm");
  });

  it("nothing to fix -> first service, honest reason; no services -> null", () => {
    expect(suggestionLine(recommendService(ok("whatsapp"), mokub))).toBe("Servicio sugerido: Agentes de IA y automatización · encaja con el perfil de la búsqueda");
    expect(recommendService(opp("whatsapp"), [])).toBeNull();
  });
});

describe("Cómo le ayudamos", () => {
  it("is a fixed template per finding that names the service and its outcome", () => {
    expect(howWeHelp("whatsapp", mokub)).toBe(
      "Para que quien llega a su sitio le escriba por WhatsApp y reciba respuesta a cualquier hora: Agentes de IA y automatización. Resultado: menos trabajo manual y repetitivo; procesos que pasan de horas a minutos.",
    );
    expect(howWeHelp("no-website", mokub)).toContain("Landing pages y webs. Resultado: un sitio moderno que convierte visitas en clientes.");
    expect(howWeHelp("whatsapp", mokub)).toBe(howWeHelp("whatsapp", mokub)); // deterministic
  });

  it("stays as before without services or for unknown findings", () => {
    expect(howWeHelp("whatsapp", [])).toBeNull();
    expect(howWeHelp("otra-cosa", mokub)).toBeNull();
  });
});

describe("Claude suggestions (mock)", () => {
  it("services_suggest returns a valid editable catalog without proofs", async () => {
    expect(ServiceCatalog.safeParse(JSON.parse(mockServicesSuggest("Agencia de agentes de WhatsApp y sitios web")).services).success).toBe(true);
    const costs: string[] = [];
    const res = await handleServicesSuggest(
      { description: "Somos una agencia que hace agentes de WhatsApp con IA y sitios web para clínicas" },
      { ai: createMockAnthropic(), recordCost: async (r) => void costs.push(r.task) },
    );
    expect(res.status).toBe(200);
    const body = res.body as { services: { name: string; proof?: string }[]; is_mock: boolean };
    expect(body.services.map((s) => s.name)).toEqual(["Agente de WhatsApp con IA", "Sitios web y landing pages"]);
    expect(body.services.every((s) => !s.proof)).toBe(true);
    expect(body.is_mock).toBe(true);
    expect(costs).toEqual(["services_suggest"]);
    expect((await handleServicesSuggest({ description: "corto" }, { ai: createMockAnthropic() })).status).toBe(400);
  });

  it("offer_angles: 2-3 angles tied to chosen services and 1-2 refinements", async () => {
    const res = await handleOfferAngles({ criteria: { sector: "dental", city: "Bogota", signals: [] }, services: mokub }, { ai: createMockAnthropic() });
    expect(res.status).toBe(200);
    const body = res.body as { angles: { text: string; serviceId: string }[]; refinements: { text: string }[] };
    expect(body.angles.length).toBeGreaterThanOrEqual(2);
    expect(body.angles.length).toBeLessThanOrEqual(3);
    expect(body.angles[0]!.text).toBe("Clínicas dentales sin sitio web propio no aparecen cuando alguien busca en internet → Landing pages y webs");
    expect(body.angles[1]!.text).toContain("sin WhatsApp en el sitio pierden clientes que escriben fuera de horario → Agentes de IA y automatización");
    expect(body.refinements.length).toBeGreaterThanOrEqual(1);
    expect(body.refinements[0]!.text).toBe("Incluye clínicas dentales sin sitio web propio");
  });

  it("falls back to deterministic angles when the model points to unknown services", async () => {
    const liar: AnthropicAdapter = {
      model: "m",
      isMock: false,
      async completeRaw() {
        return { text: JSON.stringify({ angles: [{ text: "Ángulo inventado sin servicio", serviceId: "nope", signal: "whatsapp" }], refinements: [] }), usage: { input_tokens: 5, output_tokens: 5 } };
      },
    };
    const res = await handleOfferAngles({ criteria: { sector: "dental", city: "Bogota" }, services: mokub }, { ai: liar });
    const body = res.body as { angles: { serviceId: string }[] };
    expect(body.angles.map((a) => a.serviceId)).toEqual(deterministicAngles({ criteria: { sector: "dental", city: "Bogota", signals: [] }, services: mokub }).angles.map((a) => a.serviceId));
  });
});

describe("first email with the suggested service", () => {
  const env = parseEnv({ NEXT_PUBLIC_APP_URL: "https://faro.test", EMAIL_REPLY_TO: "hola@faro.test", SENDER_ADDRESS: "Calle 1 # 2-3, Bogota", SEND_ENABLED: "false" });
  const lead = { id: "00000000-0000-4000-8000-0000000000e1", slug: "sonrisa-norte", primarySource: "reps" as const };

  it("connects one real finding with the service and closes with the entry offer", async () => {
    const prompts: string[] = [];
    const base = createMockAnthropic();
    const spy: AnthropicAdapter = { ...base, completeRaw: (p) => (prompts.push(p), base.completeRaw(p)) };
    const pitch = recommendService(opp("whatsapp", "freshness"), mokub);
    const g = await generateMessage(lead, { name: "Clínica Sonrisa Norte", city: "Bogotá" }, { criteria: { sector: "dental" } }, { name: "Mokub", country: "CO" }, { ai: spy, channel: "email", recipient: "info@sonrisa.co", env, pitch });
    expect(prompts[0]).toContain("Connect exactly ONE real fact with ONE service");
    expect(prompts[0]).toContain('"finding":"su sitio no tiene un botón de WhatsApp"');
    expect(prompts[0]).toContain('"name":"Agentes de IA y automatización"');
    expect(prompts[0]).not.toContain("año viejo"); // only one finding goes in
    expect(g.text).toContain("Revisamos la información pública de Clínica Sonrisa Norte: su sitio no tiene un botón de WhatsApp.");
    expect(g.text).toContain("le proponemos Agentes de IA y automatización.");
    expect(g.text).toContain("Si le interesa, el primer paso: Llamada de descubrimiento gratuita de 15–20 min.");
    expect(g.text).toContain("https://faro.test/d/sonrisa-norte?c=email&s=reps");
    expect(g.text).toContain("darse de baja toma un clic");
    expect(g.text.indexOf("primer paso")).toBeLessThan(g.text.indexOf("diagnóstico"));
  });

  it("without services keeps the previous copy", async () => {
    const g = await generateMessage(lead, { name: "Clínica X" }, { criteria: {} }, { name: "P", offerDescription: "Agenda en línea para clínicas", country: "CO" }, { ai: createMockAnthropic(), channel: "email", env });
    expect(g.text).toContain("Agenda en línea para clínicas");
    expect(g.text).not.toContain("primer paso");
  });
});

describe("Dapta context", () => {
  it("adds the suggested service and the offer to CSV and push body", () => {
    const rec = recommendService(opp("no-website"), mokub);
    const record = {
      leadId: "l1",
      slug: "s1",
      company: "Clínica",
      phone: "",
      email: "info@c.co",
      city: "Bogotá",
      source: "osm",
      diagnosticUrl: "https://faro.test/d/s1",
      notes: "",
      isDemo: false,
      suggestedService: suggestionLine(rec)!,
      offer: offerContext(rec),
    };
    expect(record.offer).toBe("Landing pages y webs — Un sitio moderno que convierte visitas en clientes. · Desde USD 450.");
    const csv = buildCsv([record]).csv.split("\r\n");
    expect(csv[0]!.endsWith(",servicio_sugerido,oferta")).toBe(true);
    expect(csv[1]).toContain("Servicio sugerido: Landing pages y webs · porque no encontramos un sitio web propio");
    const body = buildPushBody([record], { NEXT_PUBLIC_APP_URL: "https://faro.test" });
    expect(body.leads[0]).toMatchObject({ servicio_sugerido: record.suggestedService, oferta: record.offer });
    expect(body.callback_url).toBe("https://faro.test/api/webhooks/dapta");
  });
});

describe("services setting storage", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let db: AppDb;
  beforeAll(async () => {
    conn = await createTestDb();
    db = conn.db as unknown as AppDb;
  });
  afterAll(async () => {
    await conn.close?.();
  });

  it("serves the Mokub catalog until the team saves its own", async () => {
    const first = await getServiceCatalog(db);
    expect(first.origin).toBe("default");
    expect(first.services).toEqual(defaultCatalog().services);
    expect(first.note).toContain("Mantenimiento mensual");
    await saveServiceCatalog(db, { services: [svc({ id: "wa" })] });
    const saved = await getServiceCatalog(db);
    expect(saved.origin).toBe("panel");
    expect(saved.services.map((s) => s.id)).toEqual(["wa"]);
  });

  it("a hunt stores its offer; older hunts fall back to the catalog", async () => {
    const criteria = ICP_EXAMPLES[0]!.criteria;
    const offer = { serviceIds: ["agentes-ia"], services: mokub.slice(0, 1), angles: [{ text: "Clínicas sin WhatsApp pierden pacientes → Agentes", serviceId: "agentes-ia", signal: "whatsapp" }] };
    const { icpProfileId } = await createHunt(db, { prompt: "Clinicas dentales en Bogota", criteria, offer });
    const [row] = await db.select().from(icpProfiles).where(eq(icpProfiles.id, icpProfileId));
    const eff = await loadEffectiveOffer(db, row!.offer);
    expect(eff.origin).toBe("hunt");
    expect(eff.services.map((s) => s.id)).toEqual(["agentes-ia"]);
    expect(eff.angles).toHaveLength(1);
    const legacy = await createHunt(db, { prompt: "Clinicas dentales en Bogota", criteria });
    const [old] = await db.select().from(icpProfiles).where(eq(icpProfiles.id, legacy.icpProfileId));
    expect(old!.offer).toBeNull();
    expect((await loadEffectiveOffer(db, old!.offer)).origin).toBe("catalog");
  });
});
