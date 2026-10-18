import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICES } from "@/config/default-services";
import { isHealthSector, localize } from "@/features/diagnostic/vocab";
import { howWeHelp } from "@/features/offer/match";
import { ServiceCatalog } from "@/features/offer/schema";

describe("diagnostic copy per sector", () => {
  it("keeps clinic copy for health searches and switches to empresa/cliente otherwise", () => {
    expect(isHealthSector({ sector: "dental", ciiu: ["8622"] })).toBe(true);
    expect(isHealthSector({ sector: "Contabilidad y asesoría tributaria", ciiu: ["6920"], osmTags: ["office=accountant"] })).toBe(false);
    expect(isHealthSector(null)).toBe(true);
    expect(localize("Si un paciente nuevo llega, pide cita en la siguiente clínica.", false)).toBe("Si un cliente nuevo llega, pide una asesoría en la siguiente empresa.");
    expect(localize("Su sitio no permite agendar citas en línea", false)).toBe("Su sitio no permite agendar asesorías en línea");
    expect(localize("Agregue un botón «Agendar cita» y confirme la cita por WhatsApp.", false)).toBe("Agregue un botón «Agendar asesoría» y confirme la reunión por WhatsApp.");
    expect(localize("Diagnóstico de captación de pacientes", false)).toBe("Diagnóstico de captación de clientes");
    expect(localize("Usted frente a 30 clínicas de Bogotá", true)).toBe("Usted frente a 30 clínicas de Bogotá");
  });

  it("only says how we help when a chosen service really fits the finding", () => {
    const ragAndCrm = ServiceCatalog.parse(DEFAULT_SERVICES.filter((s) => s.id === "rag" || s.id === "software-crm"));
    expect(howWeHelp("whatsapp", ragAndCrm)).toBeNull();
    expect(howWeHelp("form", ragAndCrm)).toBeNull();
    expect(howWeHelp("booking", ragAndCrm)).toContain("Software y CRMs a medida");
    const all = ServiceCatalog.parse(DEFAULT_SERVICES);
    expect(howWeHelp("whatsapp", all)).toContain("Agentes de IA");
    expect(howWeHelp("whatsapp", all, [], { short: true })).not.toContain("Resultado");
  });
});
