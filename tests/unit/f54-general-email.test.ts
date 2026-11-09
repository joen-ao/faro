import { describe, expect, it } from "vitest";
import { generalEligibility, GENERAL_SEGMENT, segmentFor } from "@/features/offer/fit";
import { assembleGeneralEmail, bodyWords, generalSubject, MAX_GENERAL_WORDS } from "@/features/outreach/cold-email";
import { coldEmailHtml, isColdEmailText } from "@/features/outreach/email-html";

const mail = [{ type: "email", isGeneric: true, value: "info@empresa.co" }];

describe("F54 · who gets the general email", () => {
  it("fit legal entity with a generic mailbox, any sector; never non-buyers or personal mailboxes", () => {
    expect(generalEligibility({ sector: "Bioimpresión 3D", company: { name: "Bio SAS", isLegalEntity: true }, contacts: mail })).toMatchObject({ ok: true, segment: { id: "general" } });
    expect(generalEligibility({ sector: "Manufactura", company: { name: "Planta SAS", isLegalEntity: true }, contacts: mail })).toMatchObject({ ok: true, segment: { id: "operaciones" } });
    expect(generalEligibility({ sector: "Clínicas odontológicas", company: { name: "Hospital San Rafael", isLegalEntity: true }, contacts: mail })).toEqual({ ok: false, reason: "tipo_no_objetivo" });
    expect(generalEligibility({ sector: "Manufactura", company: { name: "Planta SAS", isLegalEntity: true }, contacts: [{ type: "email", isGeneric: false, value: "juan.perez@gmail.com" }] })).toEqual({ ok: false, reason: "correo_no_generico" });
    expect(generalEligibility({ sector: "Manufactura", company: { name: "Planta SAS", isLegalEntity: true }, contacts: [{ type: "email", isGeneric: true, value: "support@exampledomain.com" }] })).toEqual({ ok: false, reason: "correo_no_generico" });
  });
});

describe("F54 · general email copy", () => {
  const seg = segmentFor("Manufactura")!;
  const text = assembleGeneralEmail({
    greeting: "Hola, equipo de Planta Industrial:",
    company: "Planta Industrial",
    segmentLabel: seg.label,
    pain: seg.pain,
    evidence: "Dato: responder en la primera hora da casi 7 veces más probabilidad de concretar (Harvard Business Review).",
    services: [
      { name: "Flujo de automatización", outcome: "Procesos que pasan de horas a minutos. Sin errores de digitación." },
      { name: "Mapa de automatización", outcome: "Saber qué automatizar primero y cuánto ahorra" },
      { name: "Software y CRM a medida", outcome: "Software hecho exactamente para cómo trabaja el negocio." },
    ],
    proof: "Proceso crítico automatizado en Banco de la República: de 30 h a 15 min.",
    sourceLabel: "el RUES",
    optOutUrl: "https://faro.test/b/abc-AAAAAAAAAA",
    legal: "Mokub, NIT 1001975274-1, Bogotá",
    seller: "Mokub",
    whatsapp: "573014734934",
    ps: "PD: si no es el momento, responda «ahora no» y quedamos tan amigos como antes.",
  });
  it("is short, has the services and no diagnostic link", () => {
    expect(bodyWords(text)).toBeLessThanOrEqual(MAX_GENERAL_WORDS);
    expect(text).toContain("trabajamos con empresas de operación y logística");
    expect(text).toContain("• Flujo de automatización: procesos que pasan de horas a minutos.");
    expect(text).toContain("¿Le mostramos en 20 minutos cómo se vería en Planta Industrial?");
    expect(text).not.toContain("/d/");
    expect(generalSubject("Planta Industrial del Norte")).toBe("una idea para Planta Industrial del");
  });
  it("renders the branded HTML with the services block", () => {
    expect(isColdEmailText(text)).toBe(true);
    const html = coldEmailHtml(text, { whatsapp: "573014734934" });
    expect(html).toContain(">Esto es lo que solemos hacer</p>");
    expect(html).toContain("<strong style=\"color:#0E1726\">Mapa de automatización</strong>");
    expect(html).not.toContain("Software y CRM a medida"); // two services at most
    expect(html).toContain(">Escribir por WhatsApp</a>");
    expect(html).not.toContain("Ver el diagnóstico");
  });
  it("the general segment has services from the catalog", () => {
    expect(GENERAL_SEGMENT.services).toEqual(["agentes-ia", "landing-webs", "flujo-automatizacion"]);
  });
});
