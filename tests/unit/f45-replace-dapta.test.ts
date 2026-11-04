import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appSettings, companies, companySources, contactPoints, hunts, icpProfiles, leads, qualifications, waConversations, waMessages, workspaces } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { createMockAnthropic } from "@/integrations/anthropic";
import { createMockWaCloud, type MockWaCloud } from "@/integrations/wa-cloud";
import { closeConversation, closeIdleConversations } from "@/features/wa-agent/close";
import { historyToMessages, openTemplateConversation, recordInbound, replyTo, type AgentDeps } from "@/features/wa-agent/engine";
import { FOLLOWUP_FALLBACK, runFollowups } from "@/features/wa-agent/followup";
import { createMockAgentLlm, type ScriptStep } from "@/features/wa-agent/llm";
import { createMockMokubBooking } from "@/features/wa-agent/mokub";
import { cloudApiTemplateSender, getWaSender, waSendEnabled } from "@/features/whatsapp/sender";
import { sendWhatsapp } from "@/features/whatsapp/send";
import { approvedNames, templateStatus } from "@/features/whatsapp/template-status";
import { META_TEMPLATE_NAMES, pickTemplate, waTemplates } from "@/features/whatsapp/templates";
import { parseEnv } from "@/lib/env";
import { createTestDb } from "../helpers/test-db";

const SAT_10 = new Date("2026-10-24T15:00:00Z"); // sábado 10:00 Bogotá
const SAT_23 = new Date("2026-10-25T04:00:00Z"); // sábado 23:00 Bogotá (fuera de horario)
const cloudEnv = parseEnv({ WHATSAPP_SEND_MODE: "cloud_api", SEND_ENABLED: "true" } as never);
const PHONE_ID = "1468822719640754";
const APPROVED = new Set(Object.values(META_TEMPLATE_NAMES));

describe("F45 · templates by Meta name", () => {
  it("offers a template in cloud_api mode only once Meta approved it", () => {
    const none = waTemplates(cloudEnv);
    expect(pickTemplate({ hasReps: true, independent: false }, none)).toBeNull();
    const ok = waTemplates(cloudEnv, new Set(["mokub_diagnostico_clinica"]));
    expect(pickTemplate({ hasReps: true, independent: false }, ok)).toMatchObject({ key: "faro_diagnostico_clinica", sendRef: "mokub_diagnostico_clinica" });
    expect(pickTemplate({ hasReps: false, independent: false }, ok)).toBeNull();
    // Dapta mode keeps using the Dapta id.
    const dapta = waTemplates(parseEnv({ WHATSAPP_SEND_MODE: "dapta_flow", DAPTA_WA_TEMPLATE_EMPRESA: "e-1" } as never));
    expect(dapta.faro_diagnostico_empresa.sendRef).toBe("e-1");
  });

  it("never sends with a mock Cloud API", () => {
    expect(waSendEnabled(cloudEnv)).toBe(false);
    expect(getWaSender(cloudEnv)).toBeNull();
  });

  it("caches template statuses one hour and keeps them through a Meta outage", async () => {
    const conn = await createTestDb();
    const db = conn.db as unknown as AppDb;
    const cloud = createMockWaCloud();
    cloud.statuses.mokub_diagnostico_clinica = "APPROVED";
    cloud.statuses.mokub_diagnostico_empresa = "PENDING";
    const first = await templateStatus(db, cloud, { now: SAT_10 });
    expect([...approvedNames(first)]).toEqual(["mokub_diagnostico_clinica"]);
    cloud.statuses.mokub_diagnostico_empresa = "APPROVED";
    expect([...approvedNames(await templateStatus(db, cloud, { now: new Date(SAT_10.getTime() + 30 * 60_000) }))]).toHaveLength(1);
    const failing = { ...cloud, templateStatuses: async () => Promise.reject(new Error("down")) };
    const later = await templateStatus(db, failing, { now: new Date(SAT_10.getTime() + 2 * 3600_000) });
    expect(later.error).toBe("down");
    expect([...approvedNames(later)]).toEqual(["mokub_diagnostico_clinica"]);
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "wa_template_status"));
    expect(row).toBeTruthy();
    await conn.close();
  });
});

describe("F45 · template -> reply -> close on the same lead", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let db: AppDb;
  let huntId: string;
  let cloud: MockWaCloud;
  let n = 0;
  const closeDeps = { env: cloudEnv, summarizer: createMockAnthropic(), track: false };
  const deps = (script: ScriptStep[], now?: Date): AgentDeps => ({
    llm: createMockAgentLlm(script),
    wa: cloud,
    booking: createMockMokubBooking(),
    notify: async () => undefined,
    close: async (d, id) => {
      await closeConversation(d, closeDeps, id);
    },
    sleep: async () => undefined,
    debounceMs: 0,
    ...(now ? { now: () => now } : {}),
  });
  const mkLead = async () => {
    n++;
    const [c] = await db.insert(companies).values({ name: `Clinica ${n} SAS`, normalizedName: `clinica ${n}`, city: "Bogota", isLegalEntity: true }).returning();
    await db.insert(companySources).values({ companyId: c!.id, sourceChannel: "reps", externalId: `f45-${n}`, isMock: false });
    const phone = `+57301000${String(n).padStart(4, "0")}`;
    await db.insert(contactPoints).values({ companyId: c!.id, type: "phone", value: phone, isGeneric: true, sourceChannel: "reps" });
    const [l] = await db.insert(leads).values({ companyId: c!.id, huntId, status: "fit", primarySource: "reps", fitScore: 90 - n, slug: `f45-${n}` }).returning();
    return { leadId: l!.id, phone };
  };

  beforeAll(async () => {
    conn = await createTestDb();
    db = conn.db as unknown as AppDb;
    const [ws] = await db.insert(workspaces).values({ name: "Mokub", country: "CO" }).returning();
    const [icp] = await db.insert(icpProfiles).values({ workspaceId: ws!.id, prompt: "dental", criteria: { sector: "odontologia", city: "Bogota" } }).returning();
    const [h] = await db.insert(hunts).values({ icpProfileId: icp!.id }).returning();
    huntId = h!.id;
  }, 60_000);
  afterAll(() => conn.close());
  beforeEach(() => {
    cloud = createMockWaCloud();
  });

  it("sends the template by name, opens the conversation with the lead, and the reply closes into that lead", async () => {
    const { leadId, phone } = await mkLead();
    const r = await sendWhatsapp(db, cloudEnv, cloudApiTemplateSender(cloud), { leadIds: [leadId], now: SAT_10, approvedTemplates: APPROVED, onSent: openTemplateConversation(PHONE_ID) });
    expect(r.sent).toBe(1);
    expect(cloud.templates[0]).toMatchObject({ to: phone, name: "mokub_diagnostico_clinica", body: ["Clinica 1"], urlButton: "f45-1" });
    const [conv] = await db.select().from(waConversations).where(eq(waConversations.phone, phone));
    expect(conv).toMatchObject({ leadId, status: "abierta" });

    // Three days later the contact taps "Agendar llamada".
    const later = new Date(SAT_10.getTime() + 3 * 86400_000);
    const d = deps([(req) => {
      expect(JSON.stringify(req.messages[1])).toContain("[Plantilla enviada por Mokub]");
      return "Con gusto. ¿Qué día le sirve?";
    }, () => "Gracias, hasta luego."], later);
    await closeIdleConversations(db, closeDeps, new Date(SAT_10.getTime() + 2 * 86400_000)); // template-only: closed quietly
    expect((await db.select().from(qualifications).where(eq(qualifications.leadId, leadId))).length).toBe(0);
    const rec = await recordInbound(db, d, { phoneNumberId: PHONE_ID, from: phone, wamid: "wamid.reply-1", kind: "text", text: "Agendar llamada", contactName: null, adId: null, adClick: false, at: later });
    expect(rec.conversationId).toBe(conv!.id); // reopened, not a new conversation
    await replyTo(db, d, rec.conversationId!, rec.messageId!);
    expect(cloud.sent.map((s) => s.body)).toEqual(["Con gusto. ¿Qué día le sirve?"]);

    await closeConversation(db, closeDeps, conv!.id);
    const q = await db.select().from(qualifications).where(eq(qualifications.leadId, leadId));
    expect(q).toHaveLength(1);
    expect(q[0]!.origin).toBe("wa_agent");
    // No new "wa-" lead was created for this phone.
    const sameCompany = await db.select().from(leads).where(eq(leads.slug, `f45-1`));
    expect(sameCompany).toHaveLength(1);
    expect((await db.select().from(leads)).filter((l) => l.slug.startsWith("wa-"))).toHaveLength(0);
  });

  it("template history reads as the agent's turn", () => {
    expect(historyToMessages([
      { author: "agente", text: "Hola, Clinica 1.", kind: "template" },
      { author: "contacto", text: "Agendar llamada", kind: "text" },
    ])).toEqual([
      { role: "user", content: "[Mokub escribió primero por WhatsApp]" },
      { role: "assistant", content: "[Plantilla enviada por Mokub] Hola, Clinica 1." },
      { role: "user", content: "Agendar llamada" },
    ]);
  });
});

describe("F45 · follow-ups", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let db: AppDb;
  let cloud: MockWaCloud;
  let seq = 0;
  const mkConv = async (o: { lastText: string; quietMin: number; vars?: Record<string, unknown>; status?: "abierta" | "humano" }) => {
    const now = SAT_10;
    const phone = `+57302000${String(++seq).padStart(4, "0")}`;
    const d = deps([() => o.lastText], new Date(now.getTime() - o.quietMin * 60_000));
    const r = await recordInbound(db, d, { phoneNumberId: PHONE_ID, from: phone, wamid: `wamid.fu-${seq}`, kind: "text", text: "Hola", contactName: null, adId: null, adClick: false, at: new Date(now.getTime() - (o.quietMin + 1) * 60_000) });
    await replyTo(db, d, r.conversationId!, r.messageId!);
    await db.update(waConversations).set({ lastMessageAt: new Date(now.getTime() - o.quietMin * 60_000), ...(o.vars ? { variables: o.vars } : {}), ...(o.status ? { status: o.status } : {}) }).where(eq(waConversations.id, r.conversationId!));
    return r.conversationId!;
  };
  const deps = (script: ScriptStep[], now?: Date): AgentDeps => ({
    llm: createMockAgentLlm(script),
    wa: cloud,
    booking: createMockMokubBooking(),
    notify: async () => undefined,
    close: async () => undefined,
    sleep: async () => undefined,
    debounceMs: 0,
    ...(now ? { now: () => now } : {}),
  });

  beforeAll(async () => {
    conn = await createTestDb();
    db = conn.db as unknown as AppDb;
  });
  afterAll(() => conn.close());
  beforeEach(() => {
    cloud = createMockWaCloud();
  });

  it("sends one follow-up after a quiet question, never twice, and skips the rest", async () => {
    const due = await mkConv({ lastText: "¿Qué tipo de negocio tiene?", quietMin: 180 });
    const fresh = await mkConv({ lastText: "¿Qué tipo de negocio tiene?", quietMin: 30 });
    const noQuestion = await mkConv({ lastText: "Gracias, quedo atento.", quietMin: 180 });
    const booked = await mkConv({ lastText: "¿Algo más?", quietMin: 180, vars: { reunion_agendada: true } });
    const person = await mkConv({ lastText: "¿Algo más?", quietMin: 180, status: "humano" });
    cloud.sent.length = 0;

    const d = deps([() => "¿Pudo pensarlo? Le ayudo con gusto."], SAT_10);
    const r = await runFollowups(db, d, { afterMin: 120, max: 1, now: SAT_10 });
    expect(r.sent).toBe(1);
    expect(cloud.sent.map((s) => s.body)).toEqual(["¿Pudo pensarlo? Le ayudo con gusto."]);
    const [c] = await db.select().from(waConversations).where(eq(waConversations.id, due));
    expect(c!.variables._seguimientos).toBe(1);

    const again = await runFollowups(db, deps([() => "otra vez"], SAT_10), { afterMin: 120, max: 1, now: SAT_10 });
    expect(again.sent).toBe(0);
    for (const id of [fresh, noQuestion, booked, person]) {
      const out = await db.select().from(waMessages).where(eq(waMessages.conversationId, id));
      expect(out.filter((m) => m.direction === "out")).toHaveLength(1);
    }
  });

  it("does nothing outside Colombia's send hours and falls back to a fixed text when the model invents a time", async () => {
    await mkConv({ lastText: "¿Le sirve el diagnóstico?", quietMin: 180 });
    cloud.sent.length = 0;
    expect((await runFollowups(db, deps([() => "x?"], SAT_23), { afterMin: 120, max: 1, now: SAT_23 })).sent).toBe(0);
    const r = await runFollowups(db, deps([() => "¿Le sirve mañana a las 9:00 a. m.?"], SAT_10), { afterMin: 120, max: 1, now: SAT_10 });
    expect(r.sent).toBe(1);
    expect(cloud.sent.at(-1)!.body).toBe(FOLLOWUP_FALLBACK);
  });
});
