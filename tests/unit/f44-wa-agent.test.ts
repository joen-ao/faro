import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { costEntries, events, leads, qualifications, suppression, waConversations, waMessages } from "@/db/schema";
import { createMockAnthropic } from "@/integrations/anthropic";
import { createMockWaCloud, type MockWaCloud } from "@/integrations/wa-cloud";
import { parseMetaWebhook, verifyChallenge, verifyMetaSignature, type InboundMessage } from "@/integrations/wa-cloud/webhook";
import { closeConversation } from "@/features/wa-agent/close";
import { FIXED, historyToMessages, recordInbound, replyTo, sendAs, type AgentDeps } from "@/features/wa-agent/engine";
import { inventedTimes, isOptOut, mentionedTimes, sanitizeOutgoing } from "@/features/wa-agent/guard";
import { createMockAgentLlm, textBlock, toolBlock, type ScriptStep } from "@/features/wa-agent/llm";
import { createMockMokubBooking } from "@/features/wa-agent/mokub";
import { parseEnv } from "@/lib/env";
import { createTestDb } from "../helpers/test-db";

const env = parseEnv({});
const PHONE_ID = "1347604788441832";
let seq = 0;
const inbound = (from: string, text: string | null, extra: Partial<InboundMessage> = {}): InboundMessage => ({
  phoneNumberId: PHONE_ID,
  from,
  wamid: `wamid.in-${++seq}`,
  kind: text === null ? "audio" : "text",
  text,
  contactName: "Ana",
  adId: null,
  adClick: false,
  at: new Date(),
  ...extra,
});

describe("F44 · webhook security and parsing", () => {
  it("accepts only Meta's HMAC signature of the raw body", () => {
    const raw = '{"object":"whatsapp_business_account","entry":[]}';
    const sig = `sha256=${createHmac("sha256", "s3cret").update(raw).digest("hex")}`;
    expect(verifyMetaSignature(raw, sig, "s3cret")).toBe(true);
    expect(verifyMetaSignature(raw + " ", sig, "s3cret")).toBe(false);
    expect(verifyMetaSignature(raw, sig, undefined)).toBe(false);
    expect(verifyMetaSignature(raw, null, "s3cret")).toBe(false);
  });

  it("echoes the challenge only with the right verify token", () => {
    const ok = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "t", "hub.challenge": "42" });
    expect(verifyChallenge(ok, "t")).toBe("42");
    expect(verifyChallenge(ok, "x")).toBeNull();
    expect(verifyChallenge(ok, undefined)).toBeNull();
  });

  it("reads messages, click-to-WhatsApp ads and statuses", () => {
    const out = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: PHONE_ID },
                contacts: [{ wa_id: "573001112233", profile: { name: "Ana" } }],
                messages: [
                  { from: "573001112233", id: "wamid.A", timestamp: "1793750000", type: "text", text: { body: "Hola" }, referral: { source_type: "ad", source_id: "120245000000001", ctwa_clid: "x" } },
                  { from: "573001112233", id: "wamid.B", type: "audio" },
                ],
                statuses: [{ id: "wamid.OUT", status: "delivered" }],
              },
            },
          ],
        },
      ],
    });
    expect(out.messages[0]).toMatchObject({ from: "+573001112233", text: "Hola", adId: "120245000000001", adClick: true, contactName: "Ana", kind: "text" });
    expect(out.messages[1]).toMatchObject({ kind: "audio", text: null });
    expect(out.statuses).toEqual([{ wamid: "wamid.OUT", status: "delivered", error: null }]);
    expect(parseMetaWebhook({ object: "page", entry: [] }).messages).toEqual([]);
  });
});

describe("F44 · guard rules", () => {
  it("turns markdown into plain WhatsApp text with one emphasis", () => {
    const r = sanitizeOutgoing("## Opciones\n- **Agente de IA**: desde **$1.490.000**\n- Web 😀", { allowEmoji: false });
    expect(r.text).toBe("Opciones\n*Agente de IA*: desde $1.490.000\nWeb");
    expect(r.fixes).toEqual(expect.arrayContaining(["markdown", "emphasis", "emoji"]));
    expect(sanitizeOutgoing("Hola 😀", { allowEmoji: true }).text).toBe("Hola 😀");
    expect(sanitizeOutgoing("a. ".repeat(400), { allowEmoji: false }).text.length).toBeLessThanOrEqual(600);
  });

  it("finds times of day and flags the ones the calendar never offered", () => {
    expect(mentionedTimes("mañana a las 4:00 p. m., 17:20 o 6 pm; son 20 minutos")).toEqual(["16:00", "17:20", "18:00"]);
    expect(inventedTimes("le sirve a las 4:00 p. m. o 5:00 p. m.?", new Set(["16:00"]))).toEqual(["17:00"]);
    expect(isOptOut("BAJA")).toBe(true);
    expect(isOptOut("no me interesa, gracias")).toBe(true);
    expect(isOptOut("me interesa el agente")).toBe(false);
  });

  it("history starts with the user turn and merges consecutive turns", () => {
    const m = historyToMessages([
      { author: "agente", text: "plantilla", kind: "text" },
      { author: "contacto", text: "hola", kind: "text" },
      { author: "contacto", text: null, kind: "audio" },
      { author: "persona", text: "le escribo yo", kind: "text" },
    ]);
    expect(m).toEqual([
      { role: "user", content: "[Mokub escribió primero por WhatsApp]" },
      { role: "assistant", content: "plantilla" },
      { role: "user", content: "hola\n[audio]" },
      { role: "assistant", content: "[Equipo de Mokub] le escribo yo" },
    ]);
  });
});

describe("F44 · conversation engine", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let wa: MockWaCloud;
  let booking: ReturnType<typeof createMockMokubBooking>;
  let notices: string[];
  const closeDeps = { env, summarizer: createMockAnthropic(), track: false };

  const deps = (script: ScriptStep[]): AgentDeps & { llm: ReturnType<typeof createMockAgentLlm> } => ({
    llm: createMockAgentLlm(script),
    wa,
    booking,
    notify: async (n) => {
      notices.push(n.kind);
    },
    close: async (db, id) => {
      await closeConversation(db, closeDeps, id);
    },
    sleep: async () => undefined,
    debounceMs: 0,
  });

  /** Records one inbound message and runs the reply, like the webhook route does. */
  const say = async (d: AgentDeps, m: InboundMessage) => {
    const r = await recordInbound(conn.db, d, m);
    if (r.reply && r.conversationId && r.messageId) await replyTo(conn.db, d, r.conversationId, r.messageId);
    return r;
  };

  beforeAll(async () => {
    conn = await createTestDb();
  });
  afterAll(() => conn.close());
  beforeEach(() => {
    wa = createMockWaCloud();
    booking = createMockMokubBooking(() => new Date("2026-11-03T15:00:00Z"));
    notices = [];
  });

  it("books from an ad and closes into Faro like the Dapta webhook", async () => {
    const phone = "+573001110001";
    const d = deps([
      () => [toolBlock("guardar_datos", { ref_diagnostico: "meta-120245000000001" })],
      () => "Gracias por escribir a Mokub. ¿En qué le puedo ayudar?",
      () => [toolBlock("guardar_datos", { necesidad: "agente de WhatsApp para atender clientes" }), toolBlock("consultar_horarios", {})],
      () => "Tengo mañana a las 5:00 p. m. o 6:00 p. m. ¿Cuál le sirve?",
      () => [toolBlock("agendar_diagnostico", { nombre: "Ana Pérez", email: "ana@ferreteria.co", empresa: "Ferretería El Tornillo", interes: "agentes", fecha: "2026-11-04", dia_confirmado: "miércoles", hora: "17:00", autorizo: true })],
      (req) => {
        const last = req.messages[req.messages.length - 1]!;
        expect(JSON.stringify(last.content)).toContain('\\"ok\\":true');
        return [textBlock("Listo, quedó agendado. Le llega un correo con la invitación."), toolBlock("terminar", { calificado: true, resumen: "Ferretería, quiere agente de WhatsApp, agendó diagnóstico." })];
      },
    ]);
    // Priced like Haiku so the cost path runs (a mock model records no cost).
    d.llm = { ...d.llm, isMock: false, model: "claude-haiku-5-5" };
    await say(d, inbound(phone, "Hola, quiero probar el agente (ref. meta-120245000000001)"));
    await say(d, inbound(phone, "Quiero agendar una llamada"));
    await say(d, inbound(phone, "A las 5. Ana Pérez, ana@ferreteria.co, Ferretería El Tornillo. Sí autorizo"));

    expect(wa.sent.map((s) => s.body)).toEqual([
      "Gracias por escribir a Mokub. ¿En qué le puedo ayudar?",
      "Tengo mañana a las 5:00 p. m. o 6:00 p. m. ¿Cuál le sirve?",
      "Listo, quedó agendado. Le llega un correo con la invitación.",
    ]);
    expect(booking.booked).toHaveLength(1);
    expect(booking.booked[0]).toMatchObject({ whatsapp: phone, hora: "17:00" });
    expect(notices).toContain("reunion");

    const [conv] = await conn.db.select().from(waConversations).where(eq(waConversations.phone, phone));
    expect(conv).toMatchObject({ status: "cerrada" });
    expect(conv!.leadId).toBeTruthy();
    const [lead] = await conn.db.select().from(leads).where(eq(leads.id, conv!.leadId!));
    expect(lead).toMatchObject({ primarySource: "meta_ads", status: "qualified" });
    const evs = await conn.db.select().from(events).where(eq(events.leadId, lead!.id));
    expect(evs.map((e) => e.type)).toEqual(expect.arrayContaining(["form_submit", "qualified", "meeting_booked"]));
    expect(evs.find((e) => e.type === "form_submit")!.utm).toMatchObject({ utm_source: "meta", utm_content: "120245000000001" });
    const [q] = await conn.db.select().from(qualifications).where(eq(qualifications.leadId, lead!.id));
    expect(q).toMatchObject({ origin: "wa_agent", qualified: true, conversationId: `wa:${conv!.id}` });
    const costs = await conn.db.select().from(costEntries).where(eq(costEntries.leadId, lead!.id));
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ category: "ai", contactChannel: "whatsapp", quantity: 3 });
    expect(costs[0]!.usd).toBeGreaterThan(0);
  });

  it("a click-to-WhatsApp referral credits the ad without a ref in the text", async () => {
    const phone = "+573001110002";
    const d = deps([() => "Hola, ¿en qué le puedo ayudar?", () => [textBlock("Con gusto. Hasta luego."), toolBlock("terminar", { calificado: false, resumen: "Solo saludó." })]]);
    await say(d, inbound(phone, "Hola", { adId: "120245000000009", adClick: true }));
    expect(d.llm.calls[0]!.system.dynamic).toContain("meta-120245000000009");
    await say(d, inbound(phone, "Gracias, chao"));
    const [conv] = await conn.db.select().from(waConversations).where(eq(waConversations.phone, phone));
    const [lead] = await conn.db.select().from(leads).where(eq(leads.id, conv!.leadId!));
    expect(lead!.primarySource).toBe("meta_ads");
    const evs = await conn.db.select().from(events).where(eq(events.leadId, lead!.id));
    expect(evs.find((e) => e.type === "form_submit")!.utm).toMatchObject({ utm_content: "120245000000009" });
  });

  it("stores a retried delivery once and answers once", async () => {
    const phone = "+573001110003";
    const d = deps([() => "Hola, ¿en qué le puedo ayudar?"]);
    const m = inbound(phone, "Hola");
    await say(d, m);
    const again = await say(d, m);
    expect(again.duplicate).toBe(true);
    const [conv] = await conn.db.select().from(waConversations).where(eq(waConversations.phone, phone));
    const rows = await conn.db.select().from(waMessages).where(eq(waMessages.conversationId, conv!.id));
    expect(rows.filter((r) => r.direction === "in")).toHaveLength(1);
    expect(wa.sent).toHaveLength(1);
  });

  it("a burst of messages gets one reply from the last run", async () => {
    const phone = "+573001110004";
    const d = deps([() => "Claro, le ayudo con eso."]);
    const r1 = await recordInbound(conn.db, d, inbound(phone, "Hola"));
    const r2 = await recordInbound(conn.db, d, inbound(phone, "quiero precios"));
    expect(await replyTo(conn.db, d, r1.conversationId!, r1.messageId!)).toBe("superseded");
    expect(await replyTo(conn.db, d, r2.conversationId!, r2.messageId!)).toBe("replied");
    expect(d.llm.calls).toHaveLength(1);
    expect(d.llm.calls[0]!.messages[0]).toEqual({ role: "user", content: "Hola\nquiero precios" });
  });

  it("BAJA suppresses the number without the model and the agent stays silent after", async () => {
    const phone = "+573001110005";
    const d = deps([]);
    await say(d, inbound(phone, "BAJA"));
    expect(d.llm.calls).toHaveLength(0);
    expect(wa.sent.map((s) => s.body)).toEqual([FIXED.optOut]);
    const sup = await conn.db.select().from(suppression).where(eq(suppression.value, phone));
    expect(sup).toHaveLength(1);
    const later = await say(d, inbound(phone, "hola otra vez"));
    expect(later.reply).toBe(false);
    expect(wa.sent).toHaveLength(1);
    // "hola otra vez" may open a new (silent) conversation; the one with the BAJA is the one that must be closed.
    const [optedOut] = await conn.db.select({ id: waMessages.conversationId }).from(waMessages).where(eq(waMessages.text, "BAJA"));
    const [conv] = await conn.db.select().from(waConversations).where(eq(waConversations.id, optedOut!.id));
    expect(conv!.status).toBe("cerrada");
  });

  it("never sends a time the calendar did not return", async () => {
    const phone = "+573001110006";
    const d = deps([() => "Le sirve mañana a las 3:00 p. m.?", () => "¿Le sirve mañana a las 10:00 a. m.?"]);
    await say(d, inbound(phone, "Quiero agendar"));
    expect(d.llm.calls).toHaveLength(2); // one retry with the system note
    expect(JSON.stringify(d.llm.calls[1]!.messages)).toContain("[Sistema]");
    expect(wa.sent.map((s) => s.body)).toEqual([FIXED.fallbackTimes]);
  });

  it("refuses to book without consent or with a time it never offered", async () => {
    const phone = "+573001110007";
    const d = deps([
      () => [toolBlock("agendar_diagnostico", { nombre: "Ana Pérez", email: "ana@x.co", empresa: "X", interes: "web", fecha: "2026-11-04", hora: "17:00", autorizo: false })],
      (req) => {
        expect(JSON.stringify(req.messages.at(-1)!.content)).toContain("sin_autorizacion");
        return [toolBlock("agendar_diagnostico", { nombre: "Ana Pérez", email: "ana@x.co", empresa: "X", interes: "web", fecha: "2026-11-04", hora: "17:00", autorizo: true })];
      },
      (req) => {
        expect(JSON.stringify(req.messages.at(-1)!.content)).toContain("hora_no_consultada");
        return "Primero reviso los horarios. ¿Qué día le sirve?";
      },
    ]);
    await say(d, inbound(phone, "Agéndeme a las 5"));
    expect(booking.booked).toHaveLength(0);
  });

  it("a hand-off stops the agent; a person can reply from the inbox", async () => {
    const phone = "+573001110008";
    const d = deps([() => [textBlock("Una persona del equipo le escribe por este mismo chat."), toolBlock("pasar_a_persona", { motivo: "Pidió hablar con alguien" })]]);
    await say(d, inbound(phone, "Quiero hablar con una persona"));
    expect(notices).toContain("persona");
    const [conv] = await conn.db.select().from(waConversations).where(eq(waConversations.phone, phone));
    expect(conv!.status).toBe("humano");
    const later = await say(d, inbound(phone, "¿hola?"));
    expect(later.reply).toBe(false);
    expect(d.llm.calls).toHaveLength(1);
    await sendAs(conn.db, d, conv!, "Hola, soy Joen de Mokub.", "persona");
    const out = await conn.db.select().from(waMessages).where(eq(waMessages.conversationId, conv!.id));
    expect(out.find((m) => m.author === "persona")).toMatchObject({ status: "sent", text: "Hola, soy Joen de Mokub." });
  });

  it("a mock model records no cost", async () => {
    const phone = "+573001110010";
    const d = deps([() => "Hola."]);
    await say(d, inbound(phone, "Hola"));
    const [conv] = await conn.db.select().from(waConversations).where(eq(waConversations.phone, phone));
    const out = await conn.db.select().from(waMessages).where(eq(waMessages.conversationId, conv!.id));
    expect(out.find((m) => m.direction === "out")!.costUsd).toBe(0);
  });

  it("audio gets a fixed answer without the model", async () => {
    const phone = "+573001110009";
    const d = deps([]);
    await say(d, inbound(phone, null));
    expect(d.llm.calls).toHaveLength(0);
    expect(wa.sent.map((s) => s.body)).toEqual([FIXED.media]);
  });
});
