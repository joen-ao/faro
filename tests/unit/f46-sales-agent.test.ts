import { describe, expect, it } from "vitest";
import { noticeFields } from "@/features/wa-agent/engine";
import { createMockMokubBooking } from "@/features/wa-agent/mokub";
import { renderNotice } from "@/features/wa-agent/notify";
import { PROMPT_VERSION, staticSystemPrompt } from "@/features/wa-agent/prompt";
import { runTool, weekdayMatches, weekdayOf } from "@/features/wa-agent/tools";

const PHONE = "+573001234466";
const booking = () => createMockMokubBooking(() => new Date("2026-11-04T15:00:00Z"));
// 2026-11-05 is a Thursday, 2026-11-06 a Friday.
const base = { nombre: "Adriana Acevedo", email: "adri@spa.co", empresa: "Spa Adri", interes: "agentes", hora: "17:00", autorizo: true };
const offered = { _slots: ["17:00"] };

describe("F46 · sales prompt", () => {
  const p = staticSystemPrompt([]);
  it("acts as a sales advisor that opens with value and asks about the business", () => {
    expect(PROMPT_VERSION).toBe("mokub-ventas-f46-v1");
    expect(p).toContain("asesor comercial");
    expect(p).toContain("Nunca respondas solo \"¿en qué le puedo ayudar?\"");
    expect(p).not.toContain("agenda de una vez sin más preguntas");
  });
  it("asks to confirm an ambiguous day instead of guessing", () => {
    expect(p).toContain("NO adivines");
    expect(p).toContain("dia_confirmado");
  });
});

describe("F46 · weekday check", () => {
  it("knows the weekday of a date and tolerates accents, case and extra words", () => {
    expect(weekdayOf("2026-11-05")).toBe("jueves");
    expect(weekdayOf("2026-11-04")).toBe("miercoles");
    expect(weekdayMatches("Viernes", "2026-11-06")).toBe(true);
    expect(weekdayMatches("el miércoles 4", "2026-11-04")).toBe(true);
    expect(weekdayMatches("viernes", "2026-11-05")).toBe(false);
    expect(weekdayMatches("vienes", "2026-11-06")).toBe(false);
    expect(weekdayMatches(undefined, "2026-11-06")).toBe(false);
  });
});

describe("F46 · booking guards", () => {
  it("refuses a booking whose confirmed weekday is not the date's", async () => {
    const b = booking();
    const r = await runTool("agendar_diagnostico", { ...base, fecha: "2026-11-05", dia_confirmado: "viernes" }, { phone: PHONE, variables: { ...offered, necesidad: "agente de WhatsApp" }, booking: b });
    expect(r.result).toMatchObject({ ok: false, error: "dia_no_coincide" });
    expect(b.booked).toHaveLength(0);
  });

  it("refuses to book before knowing what the meeting is for", async () => {
    const b = booking();
    const r = await runTool("agendar_diagnostico", { ...base, fecha: "2026-11-06", dia_confirmado: "viernes" }, { phone: PHONE, variables: offered, booking: b });
    expect(r.result).toMatchObject({ ok: false, error: "falta_necesidad" });
    expect(b.booked).toHaveLength(0);
  });

  it("books with the right weekday and a known need, and reports who booked", async () => {
    const b = booking();
    const r = await runTool("agendar_diagnostico", { ...base, fecha: "2026-11-06", dia_confirmado: "viernes" }, { phone: PHONE, variables: { ...offered, necesidad: "agente de WhatsApp" }, booking: b });
    expect(r.result).toMatchObject({ ok: true });
    expect(b.booked).toHaveLength(1);
    expect(r.effects.booked).toMatchObject({ nombre: "Adriana Acevedo", email: "adri@spa.co", empresa: "Spa Adri", interes: "agentes" });
  });

  it("saves the need from guardar_datos", async () => {
    const r = await runTool("guardar_datos", { necesidad: "responder clientes por WhatsApp de noche" }, { phone: PHONE, variables: {}, booking: booking() });
    expect(r.effects.variables).toMatchObject({ necesidad: "responder clientes por WhatsApp de noche" });
  });
});

describe("F46 · owner notice", () => {
  it("carries everything needed to prepare the call, in Spanish", () => {
    const fields = [
      ["Fecha", "viernes 6 de noviembre, 16:00 (Bogotá)"],
      ["Meet", "https://meet.google.com/abc-defg-hij"],
      ["Nombre", "Adriana Acevedo"],
      ["Correo", "adri@spa.co"],
      ["Negocio", "Spa Adri"],
      ["Interés", "agentes"],
      ...noticeFields({ necesidad: "responder clientes de noche", ref_diagnostico: "meta-120245" }, null).filter(([k]) => k !== "Negocio"),
    ] as const;
    const n = renderNotice({ kind: "reunion", conversationId: "c1", phone: PHONE, detail: "Diagnóstico gratis agendado.", fields }, "https://faro.test/app/conversaciones/c1");
    expect(n.subject).toBe("[Faro] Reunión agendada por el agente · WhatsApp ···4466");
    expect(n.html).toContain('lang="es"');
    for (const s of ["Adriana Acevedo", "adri@spa.co", PHONE, "Spa Adri", "responder clientes de noche", "Anuncio o mokub.co (meta-120245)", 'href="https://meet.google.com/abc-defg-hij"', "Ver la conversación en Faro"]) expect(n.html).toContain(s);
    expect(n.text).toContain("Correo: adri@spa.co");
    expect(n.text).not.toContain("Producto de interés"); // empty rows are dropped
  });

  it("names the origin of the chat", () => {
    const origin = (v: Record<string, unknown>, ad: string | null) => noticeFields(v, ad).find(([k]) => k === "Origen")![1];
    expect(origin({}, "999")).toBe("Anuncio de Meta (meta-999)");
    expect(origin({ ref_diagnostico: "abc123" }, null)).toBe("Diagnóstico de Faro (abc123)");
    expect(origin({}, null)).toBe("Escribió directo");
  });
});
