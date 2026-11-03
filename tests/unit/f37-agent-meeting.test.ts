import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, contactPoints, events, leads, qualifications } from "@/db/schema";
import { parseEnv } from "@/lib/env";
import { normalizeDaptaNative } from "@/integrations/dapta/native";
import { daptaWebhookSchema, processDaptaWebhook } from "@/integrations/dapta/webhook";
import { trackSchedule } from "@/features/tracking/meta";
import { waTemplates } from "@/features/whatsapp/templates";
import { whatsappHref } from "@/features/diagnostic/cta";
import type { CapiAdapter, CapiEvent } from "@/integrations/meta-capi";
import { createTestDb } from "../helpers/test-db";

// Post-conversation analysis of the Mokub sales agent (synthetic values).
const body = (id: string, vars: Record<string, unknown>) => ({
  data: { conversation: { id }, contact: { phone_number: "+57 300 555 1212" }, analysis: { variables: vars } },
});

describe("F37 · sales agent variables", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let leadId: string;
  const env = parseEnv({});
  beforeAll(async () => {
    conn = await createTestDb();
    const [c] = await conn.db.insert(companies).values({ name: "Spa Sol", normalizedName: "spa sol", city: "Bogota" }).returning();
    await conn.db.insert(contactPoints).values({ companyId: c!.id, type: "whatsapp", value: "+573005551212", isGeneric: true });
    const [l] = await conn.db.insert(leads).values({ companyId: c!.id, primarySource: "osm", slug: "spa-sol", status: "contacted" }).returning();
    leadId = l!.id;
  });
  afterAll(() => conn.close());

  it("maps producto_interes, reunion_agendada, fecha_reunion and quiere_comprar", () => {
    const m = normalizeDaptaNative(body("c1", { producto_interes: "web_completa", reunion_agendada: "true", fecha_reunion: "2026-11-10T15:00:00-05:00", quiere_comprar: "no" }));
    expect(m).toMatchObject({ conversation_id: "c1", product: "web_completa", meeting_booked: true, meeting_at: "2026-11-10T15:00:00-05:00", wants_to_buy: false });
    expect(normalizeDaptaNative(body("c1b", { producto_interes: "DROP TABLE", fecha_reunion: "mañana" }))).toMatchObject({ product: undefined, meeting_at: undefined });
  });

  it("a booked call qualifies the lead, logs meeting_booked and keeps the product", async () => {
    const r = await processDaptaWebhook(conn.db, daptaWebhookSchema.parse(normalizeDaptaNative(body("c2", { calificado: false, producto_interes: "agente_whatsapp", reunion_agendada: true, fecha_reunion: "2026-11-10T15:00:00-05:00" }))), env);
    expect(r).toMatchObject({ ok: true, qualified: true, meetingBooked: true, leadId });
    const types = (await conn.db.select().from(events).where(eq(events.leadId, leadId))).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["qualified", "meeting_booked"]));
    const [q] = await conn.db.select().from(qualifications).where(eq(qualifications.conversationId, "c2"));
    expect(q!.bant).toMatchObject({ product: "agente_whatsapp", meeting_at: "2026-11-10T15:00:00-05:00" });
  });

  it("a purchase intent logs purchase_intent; an opt-out never books", async () => {
    await processDaptaWebhook(conn.db, daptaWebhookSchema.parse(normalizeDaptaNative(body("c3", { producto_interes: "web_esencial", quiere_comprar: true }))), env);
    expect((await conn.db.select().from(events).where(eq(events.leadId, leadId))).map((e) => e.type)).toContain("purchase_intent");
    const r = await processDaptaWebhook(conn.db, daptaWebhookSchema.parse(normalizeDaptaNative(body("c4", { pidio_baja: true, reunion_agendada: true }))), env);
    expect(r).toMatchObject({ ok: true, qualified: false, meetingBooked: false });
  });

  it("sends one Schedule event per conversation with hashed contact data", async () => {
    const sent: CapiEvent[] = [];
    const capi: CapiAdapter = { isMock: true, send: async (ev: CapiEvent[]) => (sent.push(...ev), { received: ev.length }) } as unknown as CapiAdapter;
    await trackSchedule(conn.db, { leadId, conversationId: "c2", email: "Dueno@SpaSol.co" }, { env: parseEnv({ META_PIXEL_ID: "1054084554311839" }), capi });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ event_name: "Schedule", action_source: "system_generated" });
    expect(sent[0]!.event_id).toMatch(/^sch-[0-9a-f]{32}$/);
    expect(JSON.stringify(sent[0])).not.toContain("SpaSol");
    expect(sent[0]!.user_data.ph?.length).toBe(1);
  });
});

describe("F37 · Mokub wording", () => {
  it("templates speak as Mokub; the clinic one falls back to the approved legacy id until its id is set", () => {
    const legacy = waTemplates({ DAPTA_WA_TEMPLATE_CLINICA: undefined, DAPTA_WA_TEMPLATE_EMPRESA: "e", DAPTA_WA_TEMPLATE_INDEPENDIENTE: "i" });
    expect(legacy.faro_diagnostico_clinica.daptaId).toBe("4c0206b2-ad45-43e0-9d74-c27a3b1640df");
    expect(legacy.faro_diagnostico_empresa.body).toContain("Le escribe el equipo de Mokub");
    const mokub = waTemplates({ DAPTA_WA_TEMPLATE_CLINICA: "c", DAPTA_WA_TEMPLATE_EMPRESA: "e", DAPTA_WA_TEMPLATE_INDEPENDIENTE: "i" });
    expect(mokub.faro_diagnostico_clinica).toMatchObject({ daptaId: "c" });
    for (const t of Object.values(mokub)) {
      expect(t.body).not.toContain("Hackathon");
      expect(t.body).toContain("BAJA");
    }
  });

  it("the diagnostic page's WhatsApp prefill asks for the free call and keeps the ref", () => {
    const href = decodeURIComponent(whatsappHref("573014734934", "Spa Sol", "spa-sol"));
    expect(href).toContain("vi el diagnóstico de Spa Sol (ref. spa-sol) y quiero agendar el diagnóstico gratis");
  });
});
