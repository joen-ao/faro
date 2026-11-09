import { describe, expect, it } from "vitest";
import { outreachEligibility, segmentFor } from "@/features/offer/fit";

describe("F53 · new segments", () => {
  it("maps the hunt sectors to segments", () => {
    expect(segmentFor("Empresas medianas y grandes con procesos de supply chain y field service que buscan optimizar procesos y costos mediante tecnología e inteligencia artificial")?.id).toBe("operaciones");
    expect(segmentFor("Manufactura")?.id).toBe("operaciones");
    expect(segmentFor("Estudios de diseño interior")?.id).toBe("diseno");
    expect(segmentFor("Colegios (instituciones educativas) de estrato 3")?.id).toBe("educacion");
    expect(segmentFor("Clínicas dermatológicas y spas")?.id).toBe("salud");
    expect(segmentFor("Psiquiatría e inteligencia artificial (salud mental con IA)")?.id).toBe("salud");
    expect(segmentFor("Bioimpresión 3D")).toBeNull();
  });

  it("only findings that fit the segment open the email", () => {
    // Reviewed site with WhatsApp and a form but no online booking: the only gap is "booking".
    const sources = [{ sourceChannel: "website", sourceUrl: "https://planta.co", license: null, isMock: false, raw: { fetchedPages: 2, signals: { onlineBooking: false } } }];
    const contacts = [
      { type: "email", sourceChannel: "rues", isGeneric: true },
      { type: "whatsapp", sourceChannel: "website", isGeneric: true },
      { type: "web_form", sourceChannel: "website", isGeneric: true },
    ];
    const company = { name: "Planta Industrial SAS", address: null, city: "Bogotá", website: "https://planta.co", isLegalEntity: true };
    expect(outreachEligibility({ sector: "Clínicas odontológicas", company, sources, contacts })).toMatchObject({ ok: true, finding: "booking" });
    expect(outreachEligibility({ sector: "Manufactura", company, sources, contacts })).toEqual({ ok: false, reason: "sin_hallazgo" });
    // Without WhatsApp on the site, operations opens with "whatsapp".
    expect(outreachEligibility({ sector: "Manufactura", company, sources, contacts: contacts.filter((c) => c.type !== "whatsapp") })).toMatchObject({ ok: true, finding: "whatsapp", segment: { id: "operaciones" } });
  });
});
