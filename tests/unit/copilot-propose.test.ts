import { describe, expect, it } from "vitest";
import { allowedPriceNumbers, BriefSchema, buildAdVariantsPrompt, lintAd, proposeAds } from "@/features/copilot";
import { createMockAnthropic } from "@/integrations/anthropic";
import { defaultCatalog } from "@/features/settings/services";

const SERVICES = defaultCatalog().services;

const prices = allowedPriceNumbers(SERVICES.flatMap((s) => [s.price, s.entryOffer]));
const ok = { primaryText: "Atendemos tus consultas por WhatsApp. Proyectos desde USD 3.000.", headline: "Agentes de IA" };

describe("policy linter", () => {
  it("passes clean copy with catalog prices", () => {
    expect(lintAd(ok, prices)).toEqual([]);
  });
  it.each([
    ["Resultados garantizados en 30 días", "promesa_garantia"],
    ["Duplica tus ventas con IA", "promesa_multiplica"],
    ["Vende x10 más", "promesa_multiplica"],
    ["Ahorra el 40 % del tiempo", "porcentaje"],
    ["Sin riesgo para tu empresa", "sin_riesgo"],
    ["La IA reemplaza a tu equipo", "reemplaza_equipo"],
    ["¿Eres dueño de una pyme?", "atributo_personal"],
    ["Proyectos desde USD 999", "precio_fuera_catalogo"],
  ])("blocks %s", (text, rule) => {
    expect(lintAd({ ...ok, primaryText: text }, prices).map((i) => i.rule)).toContain(rule);
  });
  it("enforces Meta length limits", () => {
    expect(lintAd({ ...ok, headline: "h".repeat(81) }, prices).map((i) => i.rule)).toContain("longitud");
  });
});

describe("proposeAds (mock)", () => {
  const brief = BriefSchema.parse({ serviceId: "agentes-ia", url: "https://www.mokub.co/", dailyBudget: 40000, audience: "Pymes de servicios en Bogotá", count: 4 });
  const service = SERVICES.find((s) => s.id === "software-crm")!;

  it("returns distinct, linted variants flagged as mock", async () => {
    const res = await proposeAds(brief, { service: service, catalogPrices: SERVICES.flatMap((s) => [s.price, s.entryOffer]), learnings: [] }, createMockAnthropic());
    expect(res.is_mock).toBe(true);
    expect(res.variants).toHaveLength(4);
    expect(new Set(res.variants.map((v) => v.angle.toLowerCase())).size).toBe(4);
    expect(res.variants.every((v) => Array.isArray(v.issues) && v.issues.length === 0)).toBe(true);
  });

  it("prompt carries the playbook rules and marks the payload as untrusted", () => {
    const p = buildAdVariantsPrompt(brief, { service: service, catalogPrices: [], learnings: [{ statement: "El demo gana en CTR", confidence: "media" }] });
    expect(p).toContain("[[task:ad_variants]]");
    expect(p).toMatch(/Andromeda/);
    expect(p).toMatch(/untrusted data/);
    expect(p).toContain("El demo gana en CTR");
  });
});
