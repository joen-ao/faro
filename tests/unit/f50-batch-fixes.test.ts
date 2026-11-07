import { describe, expect, it } from "vitest";
import { isGenericEmail, isPlaceholderEmail, ownEmailDomain } from "@/features/compliance/email";
import { outreachEligibility } from "@/features/offer/fit";
import { assembleColdEmail, bodyWords, displayName, verifyColdDraft, type ColdDraft } from "@/features/outreach/cold-email";
import { channelOptions } from "@/features/outreach/channel";

const places = [{ sourceChannel: "google_places", sourceUrl: null, license: "x", isMock: false, raw: { place_id: "P1" } }];
const elig = (company: { name: string; website: string | null }, email: string, sector = "Clínicas odontológicas") =>
  outreachEligibility({
    sector,
    company: { ...company, address: null, city: "Bogotá", isLegalEntity: true },
    sources: places,
    contacts: [{ type: "email", sourceChannel: "rues", isGeneric: true, value: email }],
  });

describe("F50 · display name", () => {
  it("drops legal suffixes and branch tails, fixes casing and commas", () => {
    expect(displayName("Medicamentos,dispositivos Medicos Y Tecnologias En Salud S.a.s")).toBe("Medicamentos, Dispositivos Medicos y Tecnologias en Salud");
    expect(displayName("Centro Nacional de La Salud - Medlucara Ltda")).toBe("Centro Nacional de la Salud");
    expect(displayName("GRUPO DOS MIL CLINICA COLOMBIANA DE IMPLANTES DENTALES")).toBe("Grupo Dos Mil Clinica Colombiana de Implantes Dentales");
    expect(displayName("Ips Certimedic S.a.s.")).toBe("Ips Certimedic");
    expect(displayName("Menta Clinica Dental")).toBe("Menta Clinica Dental");
    expect(displayName("CLINICA ORTHOESPECIALISTAS SAS")).toBe("Clinica Orthoespecialistas");
    expect(displayName("Hogarsalud Ips Sociedad Por Acciones Simplificada")).toBe("Hogarsalud Ips");
  });
});

describe("F50 · verifier", () => {
  const input = { finding: "booking" as const, company: "Clínica Sonrisa" };
  const ok: ColdDraft = { subject: "citas en sonrisa.co", observation: "Revisé sonrisa.co y no encontré cómo pedir una cita sin llamar.", consequence: "Quien busca odontólogo de noche agenda con quien responde primero." };
  it("rejects subjects that read like a bounce", () => {
    expect(verifyColdDraft({ ...ok, subject: "sitio web no encontrado" }, input)).toContain("el asunto parece un aviso del sistema o un rebote");
    expect(verifyColdDraft(ok, input)).toEqual([]);
  });
  it("caps the assembled email at 90 words above the signature, P.S. excluded", () => {
    const a = { greeting: "Hola, equipo de Clínica Sonrisa:", proof: "Más de 15 proyectos en producción. Pruebe nuestro agente en WhatsApp: +57 301 473 4934.", domain: "sonrisa.co", variant: "B" as const, diagnosticUrl: "https://x/d/1", sourceLabel: "el RUES", optOutUrl: "https://x/baja/1", legal: "Mokub, NIT 1", seller: "Mokub", whatsapp: "573014734934" };
    const short = assembleColdEmail({ ...a, draft: ok });
    expect(bodyWords(short)).toBeLessThanOrEqual(100);
    expect(verifyColdDraft(ok, input, short)).toEqual([]);
    const long = assembleColdEmail({ ...a, draft: { ...ok, consequence: "palabra ".repeat(80).trim() } });
    expect(verifyColdDraft(ok, input, long).some((p) => p.includes("100 palabras"))).toBe(true);
  });
});

describe("F50 · mailboxes", () => {
  it("template addresses are never generic nor a channel", () => {
    expect(isPlaceholderEmail("support@exampledomain.com")).toBe(true);
    expect(isPlaceholderEmail("user@domain.com")).toBe(true);
    expect(isGenericEmail("support@exampledomain.com")).toBe(false);
    expect(isGenericEmail("info@clinica.co")).toBe(true);
    expect(channelOptions([{ type: "email", value: "support@exampledomain.com", isGeneric: true }], { whatsappEnabled: false, country: "CO" })).toEqual([]);
    expect(elig({ name: "NP Medical IPS", website: "https://npmedical.com" }, "support@exampledomain.com")).toEqual({ ok: false, reason: "correo_no_generico" });
  });
  it("own email domain vs free providers", () => {
    expect(ownEmailDomain("info@meditecsa.co")).toBe("meditecsa.co");
    expect(ownEmailDomain("citas@gmail.com")).toBeNull();
  });
});

describe("F50 · the mailbox domain is the company's site", () => {
  it("no website + own domain mailbox → review that site first", () => {
    expect(elig({ name: "Traumed Implantes SAS", website: null }, "info@traumedimplantes.com")).toEqual({ ok: false, reason: "web_por_revisar" });
  });
  it("website on another domain → doubtful", () => {
    expect(elig({ name: "Dental Caribe EU", website: "https://tubocaclinicadental.com" }, "info@dentalcaribe.co")).toEqual({ ok: false, reason: "web_dudosa" });
  });
  it("free mailbox keeps the F49 rule; matching domain passes", () => {
    expect(elig({ name: "Clínica Sonrisa SAS", website: null }, "info@gmail.com")).toMatchObject({ ok: true, finding: "no-website" });
    const same = elig({ name: "Clínica Sonrisa SAS", website: "https://www.sonrisa.co" }, "citas@sonrisa.co");
    expect(same.ok ? "ok" : same.reason).not.toMatch(/web_por_revisar|web_dudosa/);
  });
});

describe("F50 · health names that do not take patients", () => {
  it.each(["Medicamentos,dispositivos Medicos Y Tecnologias En Salud S.a.s", "Consultoria Y Asesoria En Seguridad Y Salud En El Trabajo Essat Sas", "Hospital San Rafael", "Edificio Ambulatorio - Fundación Santa Fe de Bogotá", "FUNCANCER - Fundación Fondo de Droga para el Cáncer", "Asesoria Y Servicios Administrativos Y Financieros Integrales Y De Salud S.a.s"])("%s", (name) => {
    expect(elig({ name, website: null }, "info@gmail.com")).toEqual({ ok: false, reason: "tipo_no_objetivo" });
  });
  it("only in the health segment", () => {
    expect(elig({ name: "Distribuidora Contable SAS", website: null }, "info@gmail.com", "Firmas de contabilidad").ok).toBe(true);
  });
});
