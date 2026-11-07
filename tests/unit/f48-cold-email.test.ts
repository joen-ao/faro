import { describe, expect, it } from "vitest";
import { outreachEligibility, segmentFor } from "@/features/offer/fit";
import { bodyWords, fallbackDraft, pickVariant, verifyColdDraft, type ColdInput } from "@/features/outreach/cold-email";
import { generateMessage } from "@/features/outreach/generate";
import type { AnthropicAdapter } from "@/integrations/anthropic";
import { createMockAnthropic } from "@/integrations/anthropic";
import { parseEnv } from "@/lib/env";

const env = parseEnv({ NEXT_PUBLIC_APP_URL: "https://faro.test", EMAIL_REPLY_TO: "hola@faro.test", SENDER_LEGAL_NAME: "Mokub, NIT 1001975274-1", SENDER_ADDRESS: "Bogotá", SEND_ENABLED: "false" } as never);
const reviewed = (signals: Record<string, unknown>) => [{ sourceChannel: "website", sourceUrl: "https://clinica.co", license: null, isMock: false, raw: { fetchedPages: 2, signals } }];
const company = { name: "Clínica Sonrisa SAS", address: null, city: "Bogotá", website: "https://clinica.co", isLegalEntity: true };
const generic = [{ type: "email", sourceChannel: "rues", isGeneric: true }];

describe("F48 · who gets a cold email", () => {
  it("matches sectors and leaves the rest out", () => {
    expect(segmentFor("Clínicas odontológicas")?.id).toBe("salud");
    expect(segmentFor("Contabilidad y asesoría tributaria")?.id).toBe("contabilidad");
    expect(segmentFor("Empresas con procesos de supply chain y field service")).toBeNull();
  });

  it("needs a sector offer, a generic mailbox and a real finding", () => {
    const base = { sector: "Clínicas odontológicas", company, sources: reviewed({ onlineBooking: false }), contacts: generic };
    expect(outreachEligibility(base)).toMatchObject({ ok: true, finding: "whatsapp" });
    expect(outreachEligibility({ ...base, sector: "Logística y supply chain" })).toEqual({ ok: false, reason: "sector_sin_oferta" });
    expect(outreachEligibility({ ...base, contacts: [{ type: "email", sourceChannel: "rues", isGeneric: false }] })).toEqual({ ok: false, reason: "correo_no_generico" });
    expect(outreachEligibility({ ...base, company: { ...company, isLegalEntity: false } })).toEqual({ ok: false, reason: "correo_no_generico" });
    // A website that was never reviewed is not a finding.
    expect(outreachEligibility({ ...base, sources: [] })).toEqual({ ok: false, reason: "sin_hallazgo" });
  });

  it("'no website' only counts when Google Maps was checked", () => {
    const noWeb = { sector: "Consultorios de salud", company: { ...company, website: null }, contacts: generic };
    expect(outreachEligibility({ ...noWeb, sources: [{ sourceChannel: "rues", sourceUrl: null, license: null, isMock: false, raw: {} }] })).toEqual({ ok: false, reason: "sin_web_no_verificada" });
    expect(outreachEligibility({ ...noWeb, sources: [{ sourceChannel: "google_places", sourceUrl: null, license: null, isMock: false, raw: { place_id: "P1" } }] })).toMatchObject({ ok: true, finding: "no-website" });
  });
});

describe("F48 · the draft verifier", () => {
  const input = { finding: "booking" as const, company: "Clínica Sonrisa" };
  it("accepts a plain observation + consequence", () => {
    expect(verifyColdDraft({ subject: "citas en clinica.co", observation: "Revisé clinica.co y no encontré cómo agendar una cita sin llamar.", consequence: "Quien busca odontólogo de noche suele agendar con quien responde primero." }, input)).toEqual([]);
  });
  it("rejects price, hype, tuteo, links, long subjects and a first line without the finding", () => {
    const bad = verifyColdDraft({ subject: "Una propuesta increíble de Mokub para su clínica hoy", observation: "Su clínica es excelente y tú puedes crecer.", consequence: "Por solo $1.490.000 en https://x.co lo logras!" }, input);
    expect(bad).toEqual(expect.arrayContaining(["menciona precio", "usa halagos o adjetivos de marketing", "tutea (debe ser usted)", "usa signos de exclamación", "incluye enlaces", "asunto de más de 6 palabras", "la primera frase no dice el hallazgo"]));
  });
  it("the fallback draft always passes", () => {
    const ci: ColdInput = { company: "Clínica Sonrisa", city: "Bogotá", domain: "clinica.co", finding: "whatsapp", pain: "pacientes que se van con otra clínica", service: { name: "Agente", outcome: "x" } };
    expect(verifyColdDraft(fallbackDraft(ci), ci)).toEqual([]);
    expect(verifyColdDraft(fallbackDraft({ ...ci, domain: null, finding: "no-website" }), { ...ci, finding: "no-website" })).toEqual([]);
  });
});

describe("F48 · the cold email", () => {
  const pitch = {
    service: { id: "agentes-ia", name: "Agente de IA en WhatsApp", description: "Atiende y agenda", outcome: "Menos clientes perdidos", price: "Desde $1.490.000", entryOffer: "Diagnóstico gratis", proof: "Más de 15 proyectos en producción", keywords: [] },
    finding: "booking" as const,
    reason: "x",
  };
  const lead = (id: string) => ({ id, slug: "sonrisa", primarySource: "reps" as const });
  const cold = { finding: "booking" as const, pain: "pacientes que agendan con otra clínica que responde primero", website: "https://clinica.co" };

  it("has no price, ≤ 90 words above the signature, the proof, a question and the short legal footer", async () => {
    const g = await generateMessage(lead("00000000-0000-4000-8000-000000000001"), { name: "Clínica Sonrisa SAS", city: "Bogotá" }, { criteria: {} }, { name: "Mokub", country: "CO" }, { ai: createMockAnthropic(), channel: "email", recipient: "info@clinica.co", env, pitch: pitch as never, sellerName: "Mokub", cold });
    expect(g.text).not.toMatch(/\$|precio/i);
    expect(bodyWords(g.text)).toBeLessThanOrEqual(90);
    expect(g.text).toContain("Más de 15 proyectos en producción.");
    expect(g.text).toContain("¿Se lo enviamos por aquí o por WhatsApp?");
    expect(g.text).toContain("Mokub, NIT 1001975274-1, Bogotá. Le escribimos porque su empresa aparece en el REPS");
    expect(g.text).toContain("responda BAJA");
    expect(g.text).not.toContain("Quién escribe");
    expect(g.html).not.toContain("#cbe850"); // plain HTML, not the marketing template
  });

  it("variant A offers the diagnostic without a link; B adds it as a P.S.", async () => {
    const ids = ["00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2", "00000000-0000-4000-8000-0000000000a3", "00000000-0000-4000-8000-0000000000a4"];
    const a = ids.find((id) => pickVariant(id) === "A")!;
    const b = ids.find((id) => pickVariant(id) === "B")!;
    const gen = (id: string) => generateMessage(lead(id), { name: "Clínica Sonrisa SAS", city: "Bogotá" }, { criteria: {} }, { name: "Mokub", country: "CO" }, { ai: createMockAnthropic(), channel: "email", recipient: "info@clinica.co", env, pitch: pitch as never, cold });
    expect((await gen(a)).text).not.toContain("/d/sonrisa");
    expect((await gen(b)).text).toContain("PD: si prefiere verlo ya, está aquí: https://faro.test/d/sonrisa");
  });

  it("regenerates once with the reasons and falls back to the safe draft", async () => {
    const prompts: string[] = [];
    const salesy: AnthropicAdapter = {
      model: "m",
      isMock: true,
      async completeRaw(p) {
        prompts.push(p);
        return { text: JSON.stringify({ subject: "Oferta increíble", observation: "Su clínica es excelente.", consequence: "Por solo $100 lo logras!" }), usage: { input_tokens: 1, output_tokens: 1 } };
      },
    };
    const g = await generateMessage(lead("00000000-0000-4000-8000-0000000000b1"), { name: "Clínica Sonrisa SAS", city: "Bogotá" }, { criteria: {} }, { name: "Mokub", country: "CO" }, { ai: salesy, channel: "email", recipient: "info@clinica.co", env, pitch: pitch as never, cold });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Tu borrador anterior fue rechazado por: menciona precio");
    expect(g.text).toContain("Revisé clinica.co y vi que el sitio no permite agendar en línea.");
    expect(g.text).not.toMatch(/increíble|\$/);
  });
});
