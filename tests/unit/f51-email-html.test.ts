import { describe, expect, it } from "vitest";
import { createShortOptOutCode, verifyShortOptOutCode } from "@/features/compliance/optout";
import { assembleColdEmail, bodyWords } from "@/features/outreach/cold-email";
import { coldEmailHtml, isColdEmailText } from "@/features/outreach/email-html";
import { textToHtml } from "@/features/outreach/generate";

const base = {
  greeting: "Hola, equipo de Menta Clinica Dental:",
  draft: { subject: "formulario en clinicamenta.com", observation: "Revisé clinicamenta.com y su sitio no tiene formulario de contacto.", consequence: "Quien busca cita fuera de horario agenda con la clínica que contesta primero." },
  proof: "Más de 15 proyectos en producción. Pruebe nuestro agente en WhatsApp: +57 301 473 4934.",
  domain: "clinicamenta.com",
  diagnosticUrl: "https://faro.test/d/abc?c=email&s=reps",
  sourceLabel: "el REPS",
  optOutUrl: `https://faro.test/b/${createShortOptOutCode("abc")}`,
  legal: "Mokub, NIT 1001975274-1, Bogotá",
  seller: "Mokub",
  whatsapp: "573014734934",
};

describe("F51 · short opt-out code", () => {
  it("round-trips and rejects a tampered signature", () => {
    const code = createShortOptOutCode("abc");
    expect(code).toMatch(/^abc-[A-Za-z0-9_-]{10}$/);
    expect(verifyShortOptOutCode(code)).toBe("abc");
    expect(verifyShortOptOutCode(`${code.slice(0, -1)}${code.endsWith("A") ? "B" : "A"}`)).toBeNull();
    expect(verifyShortOptOutCode("wa-123-" + createShortOptOutCode("wa-123").slice(-10))).toBe("wa-123");
  });
});

describe("F51 · branded cold email HTML", () => {
  it("variant A: logo, proof block, WhatsApp link, short opt-out as text, no button", () => {
    const text = assembleColdEmail({ ...base, variant: "A" });
    expect(isColdEmailText(text)).toBe(true);
    expect(bodyWords(text)).toBeLessThanOrEqual(100);
    const html = textToHtml(text, "https://faro.test/");
    expect(html).toContain('src="https://faro.test/brand/mokub-logo-white.png"');
    expect(html).toContain("https://wa.me/573014734934");
    expect(html).toContain(">darse de baja aquí</a>");
    expect(html).toContain(base.optOutUrl);
    expect(html).not.toContain("Ver el diagnóstico");
    expect(html).toContain("NIT 1001975274-1");
    expect(text).toContain(base.optOutUrl);
  });
  it("variant B: the P.S. becomes the button", () => {
    const html = coldEmailHtml(assembleColdEmail({ ...base, variant: "B" }));
    expect(html).toContain(">Ver el diagnóstico</a>");
    expect(html).toContain('href="https://faro.test/d/abc?c=email&amp;s=reps"');
    expect(html).not.toContain("PD:");
  });
  it("escapes content and leaves other emails on the old template", () => {
    const html = coldEmailHtml(assembleColdEmail({ ...base, variant: "A", greeting: "Hola, equipo de <script>x</script>:" }));
    expect(html).not.toContain("<script>");
    expect(isColdEmailText("Hola:\n\nTexto.\n\nSi no desea recibir mensajes nuestros, darse de baja: https://x/baja/t")).toBe(false);
  });
});

describe("F52 · pain with a source, human tone", () => {
  it("evidence comes from the sourced list; health figures only in health searches", async () => {
    const { evidenceFor, evidenceLine } = await import("@/features/offer/evidence");
    expect(evidenceFor("booking", true)?.figure).toBe("42 %");
    expect(evidenceFor("booking", false)?.figure).toBe("7×");
    expect(evidenceFor("social")).toBeNull();
    expect(evidenceLine(evidenceFor("whatsapp")!)).toBe("Dato: responder en la primera hora da casi 7 veces más probabilidad de concretar (Harvard Business Review).");
  });
  it("verifier rejects insults, laughs, emojis and model-made figures; accepts a short compliment", async () => {
    const { verifyColdDraft } = await import("@/features/outreach/cold-email");
    const input = { finding: "whatsapp" as const, company: "X" };
    const ok = { subject: "su página y un detalle", observation: "Estuve viendo x.co y se ve muy bien, pero no encontré un botón de WhatsApp.", consequence: "Y quien escribe de noche se queda con quien responde primero." };
    expect(verifyColdDraft(ok, input)).toEqual([]);
    expect(verifyColdDraft({ ...ok, observation: "Su página es horrible, pero no tiene WhatsApp." }, input)).toContain("usa insultos, risas o emojis");
    expect(verifyColdDraft({ ...ok, consequence: "jaja, pierde clientes." }, input)).toContain("usa insultos, risas o emojis");
    expect(verifyColdDraft({ ...ok, consequence: "Pierde el 30 de cada 100 clientes." }, input)).toContain("la consecuencia trae cifras (el dato lo ponemos nosotros)");
  });
  it("a person signs when configured; P.S. lines do not count; HTML has the WhatsApp button and the figure", () => {
    const t = assembleColdEmail({ ...base, variant: "B", evidence: "Dato: responder en la primera hora da casi 7 veces más probabilidad de concretar (Harvard Business Review).", person: { name: "Ana Pérez", role: "Fundadora" }, ps: "PD: si no es el momento, responda «ahora no» y quedamos tan amigos como antes." });
    expect(t).toContain("Ana Pérez\nFundadora · Mokub\nWhatsApp +57 301 473 4934 · mokub.co");
    expect(t).toContain("¿Le mando el diagnóstico completo");
    expect(bodyWords(t)).toBeLessThanOrEqual(100);
    const html = coldEmailHtml(t, { whatsapp: "573014734934" });
    expect(html).toContain(">Escribir por WhatsApp</a>");
    expect(html).toContain(">Ver el diagnóstico</a>");
    expect(html).toContain("7×");
    expect(html).toContain("Fuente: Harvard Business Review");
    expect(html).toContain("Ana Pérez");
    expect(html).toContain(">Mokub</td>");
    const team = assembleColdEmail({ ...base, variant: "A" });
    expect(team).toContain("Equipo de Mokub");
    expect(coldEmailHtml(team)).toContain(">Mokub</td>");
  });
});

describe("F52 · the proof line follows from the finding", () => {
  it("bridges each finding to what Mokub does, proof in parentheses, demo only for the agent", async () => {
    const { proofLine } = await import("@/features/outreach/cold-email");
    expect(proofLine({ id: "agentes-ia", proof: "Más de 15 proyectos en producción." }, "573014734934", "whatsapp")).toBe(
      "Justo eso resolvemos en Mokub: un agente de IA que responde por WhatsApp en segundos, de día y de noche (más de 15 proyectos en producción). Pruébelo: +57 301 473 4934.",
    );
    expect(proofLine({ id: "landing-webs", proof: undefined }, "573014734934", "no-website")).toBe("Justo eso resolvemos en Mokub: páginas con botón de WhatsApp y agenda, listas en días.");
    expect(proofLine({ id: "agentes-ia", proof: "X" }, "573014734934", "social")).toBe("X. Pruébelo: +57 301 473 4934.");
  });
});
